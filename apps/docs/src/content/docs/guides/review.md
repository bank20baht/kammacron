---
title: Review
description: Why a card waits for you, and the three things you can do with it.
---

A card goes to **Review** when a person should decide:

- Claude moved it there, with a reason (it could not finish, it needs a decision);
- a step of the playbook failed: the reason names the step, and the end of its output is a comment on the card;
- the Claude step ended without moving the card, or hit its max turns;
- a run was stopped, or ran past the stale time, twice.

![A card waiting in Review, with its reason](../../../assets/review.png)

![How to review a card, in six numbered steps: open Review, pick the card, read why the agent sent it, choose Send back, Approve or I'll take it, say what to change, confirm](../../../assets/howto/4-review.png)

The **Review** page lists every such card with its reason and the latest run.

- **Send back**: Claude tries again with your note, which it reads on the next run (with the earlier runs' summaries).
- **Approve**: what the run left is right; the card is done. kammacron merges and pushes nothing: if the work waits on a branch, ship it your way, or send the card back saying how.
- **I'll take it**: marks the card human; the worker leaves it.
