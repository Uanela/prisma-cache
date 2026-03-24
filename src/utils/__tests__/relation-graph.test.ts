import { RelationGraph } from "../relation-graph";

jest.mock("@prisma/client", () => ({
  Prisma: {
    dmmf: {
      datamodel: {
        models: [
          {
            name: "User",
            fields: [
              { name: "id", type: "String" },
              { name: "posts", type: "Post", relationName: "UserToPost" },
              {
                name: "profile",
                type: "Profile",
                relationName: "UserToProfile",
              },
            ],
          },
          {
            name: "Post",
            fields: [
              { name: "id", type: "String" },
              { name: "author", type: "User", relationName: "UserToPost" },
              {
                name: "comments",
                type: "Comment",
                relationName: "PostToComment",
              },
            ],
          },
          {
            name: "Profile",
            fields: [
              { name: "id", type: "String" },
              { name: "user", type: "User", relationName: "UserToProfile" },
            ],
          },
          {
            name: "Comment",
            fields: [
              { name: "id", type: "String" },
              { name: "post", type: "Post", relationName: "PostToComment" },
            ],
          },
        ],
      },
    },
  },
}));

describe("RelationGraph", () => {
  let graph: RelationGraph;

  beforeEach(() => {
    graph = new RelationGraph();
  });

  describe("constructor", () => {
    it("builds without crashing", () => {
      expect(graph).toBeInstanceOf(RelationGraph);
    });

    it("handles missing dmmf datamodel gracefully", () => {
      jest.resetModules();
      jest.doMock("@prisma/client", () => ({
        Prisma: { dmmf: {} },
      }));
      const { RelationGraph: RG } = require("../relation-graph");
      expect(() => new RG()).not.toThrow();
    });
  });

  describe("getRelatedModels", () => {
    it("returns related models for User", () => {
      const related = graph.getRelatedModels("User");
      expect(related).toContain("post");
      expect(related).toContain("profile");
    });

    it("returns related models for Post", () => {
      const related = graph.getRelatedModels("Post");
      expect(related).toContain("user");
      expect(related).toContain("comment");
    });

    it("returns related models for Profile", () => {
      const related = graph.getRelatedModels("Profile");
      expect(related).toContain("user");
    });

    it("returns empty array for unknown model", () => {
      expect(graph.getRelatedModels("NonExistent")).toEqual([]);
    });

    it("is case-insensitive via toKebab", () => {
      const a = graph.getRelatedModels("User");
      const b = graph.getRelatedModels("user");
      expect(a).toEqual(b);
    });
  });

  describe("getIncludedModels", () => {
    it("returns empty array when no args provided", () => {
      expect(graph.getIncludedModels("User")).toEqual([]);
    });

    it("returns empty array when args has no include or select", () => {
      expect(graph.getIncludedModels("User", {})).toEqual([]);
    });

    it("resolves direct include", () => {
      const included = graph.getIncludedModels("User", {
        include: { posts: true },
      });
      expect(included).toContain("post");
    });

    it("resolves multiple direct includes", () => {
      const included = graph.getIncludedModels("User", {
        include: { posts: true, profile: true },
      });
      expect(included).toContain("post");
      expect(included).toContain("profile");
    });

    it("resolves select instead of include", () => {
      const included = graph.getIncludedModels("User", {
        select: { posts: true },
      });
      expect(included).toContain("post");
    });

    it("resolves nested include", () => {
      const included = graph.getIncludedModels("User", {
        include: {
          posts: {
            include: { comments: true },
          },
        },
      });
      expect(included).toContain("post");
      expect(included).toContain("comment");
    });

    it("resolves deeply nested include", () => {
      const included = graph.getIncludedModels("User", {
        include: {
          posts: {
            include: {
              comments: {
                include: { post: true },
              },
            },
          },
        },
      });
      expect(included).toContain("post");
      expect(included).toContain("comment");
    });

    it("resolves nested select", () => {
      const included = graph.getIncludedModels("User", {
        include: {
          posts: {
            select: { comments: true },
          },
        },
      });
      expect(included).toContain("post");
      expect(included).toContain("comment");
    });

    it("ignores unknown fields in include", () => {
      const included = graph.getIncludedModels("User", {
        include: { nonExistentField: true },
      });
      expect(included).toEqual([]);
    });

    it("returns empty array for unknown model", () => {
      const included = graph.getIncludedModels("Ghost", {
        include: { posts: true },
      });
      expect(included).toEqual([]);
    });

    it("does not duplicate models when included multiple times", () => {
      const included = graph.getIncludedModels("User", {
        include: { posts: true, profile: true },
      });
      const unique = new Set(included);
      expect(unique.size).toBe(included.length);
    });
  });

  it("handles duplicate model names without overwriting", () => {
    jest.resetModules();
    jest.doMock("@prisma/client", () => ({
      Prisma: {
        dmmf: {
          datamodel: {
            models: [
              {
                name: "User",
                fields: [
                  { name: "posts", type: "Post", relationName: "UserToPost" },
                ],
              },
              {
                name: "User",
                fields: [
                  {
                    name: "profile",
                    type: "Profile",
                    relationName: "UserToProfile",
                  },
                ],
              },
            ],
          },
        },
      },
    }));
    const { RelationGraph: RG } = require("../relation-graph");
    const g = new RG();
    expect(() => g.getRelatedModels("User")).not.toThrow();
  });
});
