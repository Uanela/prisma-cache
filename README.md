# Prisma Smart Cache

**The Missing Persistence Layer for Prisma.**

`prisma-smart-cache` is a high-performance, relation-aware caching proxy powered by **BentoCache**. It transforms your database access from a bottleneck into a lightning-fast distributed system with zero boilerplate.

## Why this is different

Most Prisma caches are "dumb"—they invalidate the whole model when anything changes. This library uses **Field-Level Diffing**:

- **Granular Invalidation:** If you update `user.password`, it won't kill a cache entry that only selected `user.name`.
- **Relation-Aware:** It automatically tracks nested `include` and `select` calls. If a `Post` cache includes an `Author`, a change to the `Author` triggers a surgical strike on the `Post` cache.
- **Multi-Tier Ready:** Seamlessly combine L1 (Memory) and L2 (Redis) via BentoCache to survive massive traffic spikes.

---

## Quick Start

```ts
import { PrismaClient } from "@prisma/client";
import { BentoCache, bentostore } from "bentocache";
import { memoryDriver } from "bentocache/drivers/memory";
import { smartCache } from "prisma-smart-cache";

const bento = new BentoCache({
  default: "fast",
  stores: {
    fast: bentostore().useL1Layer(memoryDriver()),
  },
});

// Wrap and go.
const prisma = smartCache(new PrismaClient(), bento, { ttl: 60 });
```

---

## Advanced Logic

### Surgical Invalidation

The library tracks the "Query Shape." When a write occurs, it compares the mutated fields against the fields stored in your cached results.

```ts
// Cached query (only selects 'email')
await prisma.user.findUnique({
  where: { id: 1 },
  select: { email: true },
});

// This update will NOT invalidate the cache above because 'bio' wasn't selected.
await prisma.user.update({
  where: { id: 1 },
  data: { bio: "New bio" },
});
```

### Protection Against Cache Stampedes

Leveraging BentoCache's underlying logic, this library prevents "Cache-Miss Storms" where thousands of concurrent requests hit your database simultaneously when a key expires.

---

## API Reference

### Global Configuration

| Option | Type       | Description                                                    |
| :----- | :--------- | :------------------------------------------------------------- |
| `ttl`  | `number`   | Global expiration in seconds (default: 60).                    |
| `tags` | `string[]` | Permanent tags for every entry (useful for multi-tenant apps). |

### Per-Query Control

Add a `cache` object to any Prisma CRUD operation:

```ts
const data = await prisma.post.findMany({
  where: { published: true },
  cache: {
    ttl: 300,
    tags: ["homepage-content"],
    disable: false, // set to true to force a DB hit
  },
});
```

---

## Performance Tip: Hybrid Redis

For production, always use a multi-tier setup. This keeps hot data in local RAM (L1) while keeping the source of truth in Redis (L2).

```ts
const bento = new BentoCache({
  default: "production",
  stores: {
    production: bentostore()
      .useL1Layer(memoryDriver())
      .useL2Layer(redisDriver({ connection: { host: "localhost" } })),
  },
});
```

---

## Production Requirements

- **Node.js**: 18.x or higher
- **Prisma**: 5.0+ (requires DMMF access)
- **BentoCache**: 1.0+

## License

MIT

<div align="center">

Built with ❤️ by [Uanela Como](https://github.com/uanela)

</div>
