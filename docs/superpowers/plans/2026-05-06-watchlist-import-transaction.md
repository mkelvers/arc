# Watchlist Import Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the watchlist import loop in a transaction and log skipped rows.

**Architecture:** Use `db.BeginTx` to start a transaction and ensure all operations within the loop use the transaction-aware `txQueries`.

**Tech Stack:** Go, standard library `database/sql` and `log`.

---

### Task 1: Refactor ImportWatchlist to use Transaction

**Files:**
- Modify: `/Users/mkelvers/dev/personal/mal/api/watchlist/service.go`

- [ ] **Step 1: Apply transaction wrapper and logging**

- [ ] **Step 2: Commit changes**
