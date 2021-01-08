const test = require('tape')
const Corestore = require('corestore')
const Omega = require('omega')
const ram = require('random-access-memory')
const { toPromises } = require('hypercore-promisifier')

const { OutputNode } = require('../lib/nodes')
const Autobase = require('..')

test('linearizes short branches on long branches', async t => {
  const store = new Corestore(ram)
  const writerA = toPromises(store.get({ name: 'writer-a' }))
  const writerB = toPromises(store.get({ name: 'writer-b' }))
  const writerC = toPromises(store.get({ name: 'writer-c' }))

  const base = new Autobase([writerA, writerB, writerC])
  await base.ready()

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  for (let i = 0; i < 3; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const output = await causalValues(base)
    t.same(output.map(v => v.value), ['a0', 'b1', 'b0', 'c2', 'c1', 'c0'])
  }

  // Add 3 more records to A -- should switch fork ordering
  for (let i = 1; i < 4; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }

  {
    const output = await causalValues(base)
    t.same(output.map(v => v.value), ['b1', 'b0', 'c2', 'c1', 'c0', 'a3', 'a2', 'a1', 'a0'])
  }

  t.end()
})

test('causal writes', async t => {
  const store = new Corestore(ram)
  const writerA = toPromises(store.get({ name: 'writer-a' }))
  const writerB = toPromises(store.get({ name: 'writer-b' }))
  const writerC = toPromises(store.get({ name: 'writer-c' }))

  const base = new Autobase([writerA, writerB, writerC])
  await base.ready()

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest([writerA, writerB]))
  }
  for (let i = 0; i < 3; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const output = await causalValues(base)
    t.same(output.map(v => v.value), ['b1', 'b0', 'a0', 'c2', 'c1', 'c0'])
  }

  // Add 3 more records to A -- should switch fork ordering
  for (let i = 1; i < 4; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }

  {
    const output = await causalValues(base)
    t.same(output.map(v => v.value), ['b1', 'b0', 'c2', 'c1', 'c0', 'a3', 'a2', 'a1', 'a0'])
  }

  t.end()
})

test('simple rebase', async t => {
  const store = new Corestore(ram)
  const output = new Omega(ram)
  const writerA = toPromises(store.get({ name: 'writer-a' }))
  const writerB = toPromises(store.get({ name: 'writer-b' }))
  const writerC = toPromises(store.get({ name: 'writer-c' }))

  const base = new Autobase([writerA, writerB, writerC])
  await base.ready()

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  for (let i = 0; i < 3; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const result = await base.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['a0', 'b1', 'b0', 'c2', 'c1', 'c0'])
    t.same(result.added, 6)
    t.same(result.removed, 0)
    t.same(output.length, 6)
  }

  // Add 3 more records to A -- should switch fork ordering
  for (let i = 1; i < 4; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }

  {
    const result = await base.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['b1', 'b0', 'c2', 'c1', 'c0', 'a3', 'a2', 'a1', 'a0'])
    t.same(result.added, 9)
    t.same(result.removed, 6)
    t.same(output.length, 9)
  }

  t.end()
})

test('does not over-truncate', async t => {
  const store = new Corestore(ram)
  const output = new Omega(ram)
  const writerA = toPromises(store.get({ name: 'writer-a' }))
  const writerB = toPromises(store.get({ name: 'writer-b' }))
  const writerC = toPromises(store.get({ name: 'writer-c' }))

  const base = new Autobase([writerA, writerB, writerC])
  await base.ready()

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  for (let i = 0; i < 5; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const result = await base.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['a0', 'b1', 'b0', 'c4', 'c3', 'c2', 'c1', 'c0'])
    t.same(result.added, 8)
    t.same(result.removed, 0)
    t.same(output.length, 8)
  }

  // Add 3 more records to A -- should switch fork ordering (A after C)
  for (let i = 1; i < 4; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }

  {
    const result = await base.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['b1', 'b0', 'a3', 'a2', 'a1', 'a0', 'c4', 'c3', 'c2', 'c1', 'c0'])
    t.same(result.added, 6)
    t.same(result.removed, 3)
    t.same(output.length, 11)
  }

  // Add 1 more record to B -- should not cause any reordering
  await base.append(writerB, 'b2', await base.latest(writerB))

  {
    const result = await base.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['b2', 'b1', 'b0', 'a3', 'a2', 'a1', 'a0', 'c4', 'c3', 'c2', 'c1', 'c0'])
    t.same(result.added, 1)
    t.same(result.removed, 0)
    t.same(output.length, 12)
  }

  t.end()
})

test('can cut out a writer', async t => {
  const store = new Corestore(ram)
  const output = new Omega(ram)
  const writerA = toPromises(store.get({ name: 'writer-a' }))
  const writerB = toPromises(store.get({ name: 'writer-b' }))
  const writerC = toPromises(store.get({ name: 'writer-c' }))

  const base = new Autobase([writerA, writerB, writerC])
  await base.ready()

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest(writerB))
  }
  for (let i = 0; i < 5; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const result = await base.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['a0', 'b1', 'b0', 'c4', 'c3', 'c2', 'c1', 'c0'])
    t.same(result.added, 8)
    t.same(result.removed, 0)
    t.same(output.length, 8)
  }

  // Cut out writer B. Should truncate 3
  const base2 = new Autobase([writerA, writerC])

  {
    const result = await base2.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['a0', 'c4', 'c3', 'c2', 'c1', 'c0'])
    t.same(result.added, 2) // a0 and c4 are reindexed
    t.same(result.removed, 4) // a0 and c4 are both popped and reindexed
    t.same(output.length, 6)
  }

  t.end()
})

test('can cut out a writer, causal writes', async t => {
  const store = new Corestore(ram)
  const output = new Omega(ram)
  const writerA = toPromises(store.get({ name: 'writer-a' }))
  const writerB = toPromises(store.get({ name: 'writer-b' }))
  const writerC = toPromises(store.get({ name: 'writer-c' }))

  const base = new Autobase([writerA, writerB, writerC])
  await base.ready()

  // Create three independent forks
  for (let i = 0; i < 1; i++) {
    await base.append(writerA, `a${i}`, await base.latest(writerA))
  }
  for (let i = 0; i < 2; i++) {
    await base.append(writerB, `b${i}`, await base.latest([writerB, writerA]))
  }
  for (let i = 0; i < 5; i++) {
    await base.append(writerC, `c${i}`, await base.latest(writerC))
  }

  {
    const result = await base.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['b1', 'b0', 'a0', 'c4', 'c3', 'c2', 'c1', 'c0'])
    t.same(result.added, 8)
    t.same(result.removed, 0)
    t.same(output.length, 8)
  }

  // Cut out writer B. Should truncate 3
  const base2 = new Autobase([writerA, writerC])

  {
    const result = await base2.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['a0', 'c4', 'c3', 'c2', 'c1', 'c0'])
    t.same(result.added, 1) // a0 is reindexed
    t.same(result.removed, 3) // a0, b1, and b0 are popped, a0 is reindexed
    t.same(output.length, 6)
  }

  t.end()
})

test('can cut out a writer, causal writes interleaved', async t => {
  const store = new Corestore(ram)
  const output = new Omega(ram)
  const writerA = toPromises(store.get({ name: 'writer-a' }))
  const writerB = toPromises(store.get({ name: 'writer-b' }))

  const base = new Autobase([writerA, writerB])

  for (let i = 0; i < 6; i++) {
    if (i % 2) {
      await base.append(writerA, `a${i}`, await base.latest([writerA, writerB]))
    } else {
      await base.append(writerB, `b${i}`, await base.latest([writerA, writerB]))
    }
  }

  {
    const result = await base.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['a5', 'b4', 'a3', 'b2', 'a1', 'b0'])
    t.same(result.added, 6)
    t.same(result.removed, 0)
    t.same(output.length, 6)
  }

  const base2 = new Autobase([writerA])

  {
    const output = await causalValues(base2)
    t.same(output.map(v => v.value), ['a5', 'a3', 'a1'])
  }

  {
    const result = await base2.rebase(output)
    const indexed = await indexedValues(output)
    t.same(indexed.map(v => v.value), ['a5', 'a3', 'a1'])
    t.same(result.added, 3)
    t.same(result.removed, 6)
    t.same(output.length, 3)
  }

  t.end()
})

async function causalValues(base) {
  const buf = []
  for await (const outputNode of base.createCausalStream()) {
    buf.push(debugOutputNode(outputNode))
  }
  return buf
}

async function indexedValues(output) {
  const buf = []
  for (let i = output.length - 1; i >= 0; i--) {
    const outputNode = OutputNode.decode(await output.get(i))
    buf.push(debugOutputNode(outputNode))
  }
  return buf
}

function debugOutputNode(outputNode) {
  return {
    value: outputNode.node.value.toString('utf8'),
    key: outputNode.node.key,
    seq: outputNode.node.seq,
    links: outputNode.node.links,
    clock: outputNode.clock
  }
}
