import test from 'node:test'
import assert from 'node:assert/strict'
import { popToolHistory, pushToolHistory, resetToolHistory } from '../src/lib/navigation.js'

test('tool navigation stacks prior screens and ignores duplicate pushes', () => {
  let history = resetToolHistory()
  history = pushToolHistory(history, 'clipper')
  history = pushToolHistory(history, 'metadata')
  history = pushToolHistory(history, 'metadata')
  assert.deepEqual(history, [null, 'clipper', 'metadata'])
})

test('system back unwinds tool history and only reports root when the home route remains', () => {
  const first = popToolHistory([null, 'clipper', 'metadata'])
  assert.deepEqual(first, { history: [null, 'clipper'], toolId: 'clipper', moved: true })
  const home = popToolHistory([null, 'clipper'])
  assert.deepEqual(home, { history: [null], toolId: null, moved: true })
  const root = popToolHistory(home.history)
  assert.deepEqual(root, { history: [null], toolId: null, moved: false })
})
