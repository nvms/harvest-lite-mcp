#!/usr/bin/env node
// harvest-lite-mcp: Harvest time tracking for agents, to read and to log your own time. See README.md for
// signing in; run with no arguments it is an MCP server on stdio.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { signIn, useCredentials } from './auth.js'
import { deleteEntry, entries, logTime, projects, updateEntry } from './harvest.js'

const VERSION = '0.1.0'

const fail = (error) => { console.error(error.message); process.exit(1) }

if (process.argv[2] === 'auth') {
  await signIn().then(() => process.exit(0), fail)
} else {
  await useCredentials().catch(fail)
  const server = new McpServer({ name: 'harvest-lite-mcp', version: VERSION })
  const answer = (fn) => async (args) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await fn(args), null, 2) }] }
    } catch (error) {
      return { content: [{ type: 'text', text: error.message }], isError: true }
    }
  }
  const readOnly = { readOnlyHint: true, openWorldHint: true }
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  const time = z.string().describe('a time of day, like 9:00am or 13:30')
  const notesRule = 'Notes are the person\'s own: write them as they would, with no mention of an AI, an assistant or who drafted them.'

  server.registerTool('projects', {
    description: 'The projects you can log time to, each with its client and the tasks you can log under it, with their ids.',
    inputSchema: {},
    annotations: readOnly,
  }, answer(() => projects()))

  server.registerTool('entries', {
    description: 'Your time entries over a stretch of days, oldest first, with their total. Each has its id, date, hours, project, task and notes; a locked entry cannot be changed.',
    inputSchema: {
      from: date.optional().describe('first day, as 2026-10-19; Monday of this week when left out'),
      to: date.optional().describe('last day, in the same form; Sunday of this week when left out'),
    },
    annotations: readOnly,
  }, answer(entries))

  const write = {
    project_id: z.number().int().describe('a project_id from projects'),
    task_id: z.number().int().describe('a task_id under that project, from projects'),
    date: date.describe('the day worked, as 2026-10-21'),
    hours: z.number().min(0.01).max(24).describe('hours worked, like 1.5'),
    started: time,
    ended: time,
    notes: z.string().describe('what was done'),
  }
  const camel = ({ project_id, task_id, ...rest }) => ({ ...rest, projectId: project_id, taskId: task_id })

  server.registerTool('log_time', {
    description: `Logs time for you. Give hours, or started and ended for an account that tracks start and end times. ${notesRule}`,
    inputSchema: {
      ...write,
      date: write.date.optional().describe('the day worked, as 2026-10-21; today when left out'),
      hours: write.hours.optional(),
      started: write.started.optional(),
      ended: write.ended.optional(),
      notes: write.notes.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, answer((args) => logTime(camel(args))))

  server.registerTool('update_entry', {
    description: `Changes one of your time entries; only what is given changes. ${notesRule}`,
    inputSchema: {
      id: z.number().int().describe('the entry id from entries'),
      ...Object.fromEntries(Object.entries(write).map(([key, schema]) => [key, schema.optional()])),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, answer((args) => updateEntry(camel(args))))

  server.registerTool('delete_entry', {
    description: 'Deletes one of your time entries.',
    inputSchema: { id: z.number().int().describe('the entry id from entries') },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, answer(deleteEntry))

  await server.connect(new StdioServerTransport())
}
