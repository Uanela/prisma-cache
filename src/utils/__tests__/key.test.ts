import { buildCacheKey } from "../key";

describe("buildCacheKey", () => {
  it("builds a basic cache key", () => {
    expect(buildCacheKey("user", "findMany", {})).toBe(
      "prisma-smart-cache:user:findMany:{}"
    );
  });

  it("includes model and operation in key", () => {
    const key = buildCacheKey("post", "findUnique", {});
    expect(key).toContain("post");
    expect(key).toContain("findUnique");
    expect(key).toContain("prisma-smart-cache:");
  });

  it("serializes args", () => {
    const key = buildCacheKey("user", "findMany", { where: { id: 1 } });
    expect(key).toBe('prisma-smart-cache:user:findMany:{"where":{"id":1}}');
  });

  it("produces deterministic key regardless of property order", () => {
    const a = buildCacheKey("user", "findMany", { take: 10, where: { id: 1 } });
    const b = buildCacheKey("user", "findMany", { where: { id: 1 }, take: 10 });
    expect(a).toBe(b);
  });

  it("sorts nested object keys", () => {
    const a = buildCacheKey("user", "findMany", { where: { z: 1, a: 2 } });
    const b = buildCacheKey("user", "findMany", { where: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it("handles arrays in args", () => {
    const key = buildCacheKey("user", "findMany", { ids: [3, 1, 2] });
    expect(key).toBe('prisma-smart-cache:user:findMany:{"ids":[3,1,2]}');
  });

  it("preserves array order", () => {
    const a = buildCacheKey("user", "findMany", { ids: [1, 2, 3] });
    const b = buildCacheKey("user", "findMany", { ids: [3, 2, 1] });
    expect(a).not.toBe(b);
  });

  it("handles nested arrays", () => {
    const key = buildCacheKey("user", "findMany", {
      matrix: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(key).toBe(
      'prisma-smart-cache:user:findMany:{"matrix":[[1,2],[3,4]]}'
    );
  });

  it("handles null values", () => {
    const key = buildCacheKey("user", "findMany", {
      where: { deletedAt: null },
    });
    expect(key).toBe(
      'prisma-smart-cache:user:findMany:{"where":{"deletedAt":null}}'
    );
  });

  it("handles boolean values", () => {
    const key = buildCacheKey("user", "findMany", { where: { active: true } });
    expect(key).toBe(
      'prisma-smart-cache:user:findMany:{"where":{"active":true}}'
    );
  });

  it("handles number values", () => {
    const key = buildCacheKey("user", "findMany", { take: 10, skip: 0 });
    expect(key).toBe('prisma-smart-cache:user:findMany:{"skip":0,"take":10}');
  });

  it("handles string values", () => {
    const key = buildCacheKey("user", "findMany", { where: { name: "alice" } });
    expect(key).toBe(
      'prisma-smart-cache:user:findMany:{"where":{"name":"alice"}}'
    );
  });

  it("handles empty args object", () => {
    const key = buildCacheKey("user", "findMany", {});
    expect(key).toBe("prisma-smart-cache:user:findMany:{}");
  });

  it("handles deeply nested objects", () => {
    const a = buildCacheKey("user", "findMany", {
      where: { profile: { address: { city: "NY", zip: "10001" } } },
    });
    const b = buildCacheKey("user", "findMany", {
      where: { profile: { address: { zip: "10001", city: "NY" } } },
    });
    expect(a).toBe(b);
  });

  it("handles array of objects", () => {
    const key = buildCacheKey("user", "findMany", {
      where: { OR: [{ id: 1 }, { id: 2 }] },
    });
    expect(key).toBe(
      'prisma-smart-cache:user:findMany:{"where":{"OR":[{"id":1},{"id":2}]}}'
    );
  });
});
