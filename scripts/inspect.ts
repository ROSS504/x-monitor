#!/usr/bin/env tsx
import { getDb, migrate, postsRepo, draftsRepo, healthRepo } from '@x-monitor/db'

const db = getDb(); migrate(db)
const [, , cmd, arg] = process.argv

switch (cmd) {
  case 'post': {
    const id = parseInt(arg, 10)
    const post = postsRepo(db).findById(id)
    const drafts = db.prepare(`SELECT * FROM drafts WHERE post_id = ?`).all(id)
    const sent = db.prepare(`
      SELECT s.* FROM sent s JOIN drafts d ON d.id = s.draft_id WHERE d.post_id = ?
    `).all(id)
    console.log(JSON.stringify({ post, drafts, sent }, null, 2))
    break
  }
  case 'health': {
    const all = healthRepo(db).all()
    console.table(all)
    break
  }
  case 'pending': {
    const drafts = draftsRepo(db).listByStatus('pending')
    console.table(drafts.map(d => ({ id: d.id, postId: d.postId, content: d.content.slice(0, 60) })))
    break
  }
  default:
    console.error('Usage: inspect (post <id> | health | pending)')
    process.exit(1)
}
