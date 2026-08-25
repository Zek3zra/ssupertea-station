# Ssupertea Station — Phase 7 Admin Dashboard

Phase 7 turns the protected admin shell into a live order-management dashboard.

## Database step

Run this first in Supabase SQL Editor:

```text
sql/PHASE_7_ADMIN_ORDERS.sql
```

Then optionally verify with:

```text
sql/VERIFY_PHASE_7.sql
```

## Phase 7 workflow

```text
Customer places order
→ pending appears live in Admin
→ Admin presses Confirm order
→ pending becomes preparing
→ customer's cancellation locks immediately
→ delivery order can be assigned to an active Rider
→ Admin + Rider can use Assign to me
```

Phase 7 does **not** start rider GPS tracking or let a rider dispatch/complete an
order. Those actions belong to Phase 8 Rider Mode.

## Security

- confirmation and rider assignment use permission-checked Supabase RPCs
- customer RLS remains unchanged
- rider account UUIDs are stored in a separate assignment table
- customers cannot read rider assignments
- riders can read only assignments made to themselves
- Store Admins can read assignments for management

## Realtime

The Admin dashboard listens for changes to:

```text
public.orders
public.order_delivery_assignments
```

A newly placed order appears without refreshing the page.
