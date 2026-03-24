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
              { name: "email", type: "String" },
              { name: "name", type: "String" },
              { name: "bio", type: "String" },
              { name: "age", type: "Int" },
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
              { name: "title", type: "String" },
              { name: "content", type: "String" },
              { name: "published", type: "Boolean" },
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
              { name: "bio", type: "String" },
              { name: "avatar", type: "String" },
              { name: "user", type: "User", relationName: "UserToProfile" },
            ],
          },
          {
            name: "Comment",
            fields: [
              { name: "id", type: "String" },
              { name: "text", type: "String" },
              { name: "likes", type: "Int" },
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

describe("RelationGraph Field-Aware Features", () => {
  let graph: RelationGraph;

  beforeEach(() => {
    graph = new RelationGraph();
  });

  describe("parseSelectedFields", () => {
    it("returns all scalar fields when no select/include provided", () => {
      const selected = graph.parseSelectedFields("User");
      expect(selected.fields).toEqual(
        new Set(["id", "email", "name", "bio", "age"])
      );
      expect(selected.nested.size).toBe(0);
    });

    it("parses simple select with scalar fields", () => {
      const selected = graph.parseSelectedFields("User", {
        select: {
          id: true,
          email: true,
          name: true,
        },
      });
      expect(selected.fields).toEqual(new Set(["id", "email", "name"]));
      expect(selected.nested.size).toBe(0);
    });

    it("parses select with relation field as true", () => {
      const selected = graph.parseSelectedFields("User", {
        select: {
          id: true,
          posts: true,
        },
      });
      expect(selected.fields).toEqual(new Set(["id"]));
      expect(selected.nested.size).toBe(1);
      expect(selected.nested.has("posts")).toBe(true);

      const postsFields = selected.nested.get("posts")!;
      expect(postsFields.fields).toEqual(
        new Set(["id", "title", "content", "published"])
      );
    });

    it("parses select with nested relation fields", () => {
      const selected = graph.parseSelectedFields("User", {
        select: {
          id: true,
          posts: {
            select: {
              title: true,
              comments: {
                select: {
                  text: true,
                },
              },
            },
          },
        },
      });

      expect(selected.fields).toEqual(new Set(["id"]));

      const postsFields = selected.nested.get("posts")!;
      expect(postsFields.fields).toEqual(new Set(["title"]));

      const commentsFields = postsFields.nested.get("comments")!;
      expect(commentsFields.fields).toEqual(new Set(["text"]));
    });

    it("handles include syntax (backward compatible)", () => {
      const selected = graph.parseSelectedFields("User", {
        include: {
          posts: true,
        },
      });

      expect(selected.nested.has("posts")).toBe(true);
      const postsFields = selected.nested.get("posts")!;
      expect(postsFields.fields).toEqual(
        new Set(["id", "title", "content", "published"])
      );
    });

    it("handles nested include syntax", () => {
      const selected = graph.parseSelectedFields("User", {
        include: {
          posts: {
            include: {
              comments: true,
            },
          },
        },
      });

      const postsFields = selected.nested.get("posts")!;
      const commentsFields = postsFields.nested.get("comments")!;
      expect(commentsFields.fields).toEqual(new Set(["id", "text", "likes"]));
    });

    it("handles mixed include and select", () => {
      const selected = graph.parseSelectedFields("User", {
        include: {
          posts: {
            select: {
              title: true,
              comments: {
                include: {
                  post: true,
                },
              },
            },
          },
        },
      });

      expect(selected.fields).toEqual(new Set([]));

      const postsFields = selected.nested.get("posts")!;
      expect(postsFields.fields).toEqual(new Set(["title"]));

      const commentsFields = postsFields.nested.get("comments")!;
      expect(commentsFields.fields).toEqual(new Set([]));

      const postFields = commentsFields.nested.get("post")!;
      // This should be Post scalar fields, not User fields
      expect(postFields.fields).toEqual(
        new Set(["id", "title", "content", "published"])
      );
    });

    it("handles empty select object", () => {
      const selected = graph.parseSelectedFields("User", {
        select: {},
      });
      expect(selected.fields.size).toBe(0);
      expect(selected.nested.size).toBe(0);
    });

    it("ignores non-existent fields", () => {
      const selected = graph.parseSelectedFields("User", {
        select: {
          nonExistent: true,
          id: true,
        },
      });
      expect(selected.fields).toEqual(new Set(["id"]));
    });
  });

  describe("shouldInvalidate", () => {
    it("invalidates when scalar field is updated", () => {
      const cached = graph.parseSelectedFields("User", {
        select: { email: true, name: true },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        email: "new@email.com",
      });
      expect(shouldInvalidate).toBe(true);
    });

    it("does NOT invalidate when unrelated scalar field is updated", () => {
      const cached = graph.parseSelectedFields("User", {
        select: { email: true, name: true },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        bio: "new bio",
      });
      expect(shouldInvalidate).toBe(false);
    });

    it("invalidates when updating multiple fields including selected ones", () => {
      const cached = graph.parseSelectedFields("User", {
        select: { email: true },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        bio: "new bio",
        email: "new@email.com",
      });
      expect(shouldInvalidate).toBe(true);
    });

    it("invalidates when updating nested relation fields that are selected", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: { title: true },
          },
        },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        posts: {
          update: {
            where: { id: 1 },
            data: { title: "New Title" },
          },
        },
      });
      expect(shouldInvalidate).toBe(true);
    });

    it("does NOT invalidate when updating nested relation fields not selected", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: { title: true },
          },
        },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        posts: {
          update: {
            where: { id: 1 },
            data: { content: "New Content" },
          },
        },
      });
      expect(shouldInvalidate).toBe(false);
    });

    it("handles deeply nested field updates", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: {
              comments: {
                select: { text: true },
              },
            },
          },
        },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        posts: {
          update: {
            where: { id: 1 },
            data: {
              comments: {
                update: {
                  where: { id: 1 },
                  data: { text: "Updated comment" },
                },
              },
            },
          },
        },
      });
      expect(shouldInvalidate).toBe(true);
    });

    it("handles create operations on relations", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: { title: true },
          },
        },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        posts: {
          create: {
            title: "New Post",
            content: "Content",
          },
        },
      });
      expect(shouldInvalidate).toBe(true);
    });

    it("handles delete operations on relations", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: { title: true },
          },
        },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        posts: {
          delete: { id: 1 },
        },
      });
      expect(shouldInvalidate).toBe(true);
    });

    it("handles update with nested create", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: { title: true },
          },
        },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        posts: {
          update: {
            where: { id: 1 },
            data: {
              comments: {
                create: {
                  text: "New comment",
                },
              },
            },
          },
        },
      });
      expect(shouldInvalidate).toBe(false); // comments not selected
    });

    it("handles unknown model gracefully", () => {
      const cached = graph.parseSelectedFields("User", {
        select: { email: true },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "NonExistent", {
        field: "value",
      });
      expect(shouldInvalidate).toBe(false);
    });
  });

  describe("getInvalidatedFields", () => {
    it("returns paths of invalidated scalar fields", () => {
      const cached = graph.parseSelectedFields("User", {
        select: { email: true, name: true, bio: true },
      });

      const invalidated = graph.getInvalidatedFields(cached, "User", {
        email: "new@email.com",
        age: 30,
      });

      expect(invalidated).toEqual(new Set(["email"]));
    });

    it("returns paths of invalidated nested fields", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: { title: true, content: true },
          },
        },
      });

      const invalidated = graph.getInvalidatedFields(cached, "User", {
        posts: {
          update: {
            where: { id: 1 },
            data: { title: "New Title", published: true },
          },
        },
      });

      expect(invalidated).toEqual(new Set(["posts.title"]));
    });

    it("returns multiple invalidated field paths", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          email: true,
          posts: {
            select: { title: true, content: true },
          },
        },
      });

      const invalidated = graph.getInvalidatedFields(cached, "User", {
        email: "new@email.com",
        posts: {
          update: {
            where: { id: 1 },
            data: { title: "New Title" },
          },
        },
      });

      expect(invalidated).toEqual(new Set(["email", "posts.title"]));
    });

    it("handles deeply nested invalidations", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: {
              comments: {
                select: { text: true, likes: true },
              },
            },
          },
        },
      });

      const invalidated = graph.getInvalidatedFields(cached, "User", {
        posts: {
          update: {
            where: { id: 1 },
            data: {
              comments: {
                update: {
                  where: { id: 1 },
                  data: { text: "Updated", likes: 100 },
                },
              },
            },
          },
        },
      });

      expect(invalidated).toEqual(
        new Set(["posts.comments.text", "posts.comments.likes"])
      );
    });

    it("returns empty set when no fields invalidated", () => {
      const cached = graph.parseSelectedFields("User", {
        select: { email: true },
      });

      const invalidated = graph.getInvalidatedFields(cached, "User", {
        bio: "new bio",
      });

      expect(invalidated.size).toBe(0);
    });

    it("handles complex nested write structures", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: {
              comments: {
                select: { text: true },
              },
            },
          },
        },
      });

      const invalidated = graph.getInvalidatedFields(cached, "User", {
        posts: {
          create: {
            title: "New Post",
            comments: {
              create: {
                text: "New comment",
              },
            },
          },
        },
      });

      expect(invalidated).toEqual(new Set(["posts.comments.text"]));
    });
  });

  describe("getSelectedFieldsDebug", () => {
    it("returns flat list of selected fields", () => {
      const fields = graph.getSelectedFieldsDebug("User", {
        select: {
          id: true,
          email: true,
          posts: {
            select: {
              title: true,
              comments: {
                select: {
                  text: true,
                },
              },
            },
          },
        },
      });

      expect(fields).toContain("id");
      expect(fields).toContain("email");
      expect(fields).toContain("posts.title");
      expect(fields).toContain("posts.comments.text");
    });

    it("returns empty array for no selection", () => {
      const fields = graph.getSelectedFieldsDebug("User", {
        select: {},
      });
      expect(fields).toEqual([]);
    });

    it("includes all scalar fields when no select provided", () => {
      const fields = graph.getSelectedFieldsDebug("User");
      expect(fields).toContain("id");
      expect(fields).toContain("email");
      expect(fields).toContain("name");
      expect(fields).toContain("bio");
      expect(fields).toContain("age");
    });
  });

  describe("Edge Cases", () => {
    it("handles circular relations gracefully", () => {
      // User -> Post -> Comment -> Post (circular)
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: {
              comments: {
                select: {
                  post: {
                    select: {
                      title: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        posts: {
          update: {
            where: { id: 1 },
            data: {
              comments: {
                update: {
                  where: { id: 1 },
                  data: {
                    post: {
                      update: {
                        data: { title: "New Title" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      expect(shouldInvalidate).toBe(true);
    });

    it("handles undefined or null values in write data", () => {
      const cached = graph.parseSelectedFields("User", {
        select: { email: true },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        email: null,
      });
      expect(shouldInvalidate).toBe(true);
    });

    it("handles empty write data object", () => {
      const cached = graph.parseSelectedFields("User", {
        select: { email: true },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {});
      expect(shouldInvalidate).toBe(false);
    });

    it("handles model name case insensitivity", () => {
      const cached = graph.parseSelectedFields("user", {
        select: { email: true },
      });

      const shouldInvalidate = graph.shouldInvalidate(cached, "USER", {
        email: "new@email.com",
      });
      expect(shouldInvalidate).toBe(true);
    });

    it("handles complex Prisma update structures", () => {
      const cached = graph.parseSelectedFields("User", {
        select: {
          posts: {
            select: {
              title: true,
            },
          },
        },
      });

      // Prisma's nested write structure with updateMany
      const shouldInvalidate = graph.shouldInvalidate(cached, "User", {
        posts: {
          updateMany: {
            where: { published: false },
            data: { title: "Updated Title" },
          },
        },
      });
      expect(shouldInvalidate).toBe(true);
    });
  });

  describe("Performance and Memory", () => {
    it("handles large field selections without issues", () => {
      const largeSelect: any = { select: {} };
      for (let i = 0; i < 100; i++) {
        largeSelect.select[`field${i}`] = true;
      }

      expect(() =>
        graph.parseSelectedFields("User", largeSelect)
      ).not.toThrow();
    });

    it("handles deeply nested structures without stack overflow", () => {
      let nestedSelect: any = { select: { field: true } };
      for (let i = 0; i < 50; i++) {
        nestedSelect = { select: { nested: nestedSelect } };
      }

      expect(() =>
        graph.parseSelectedFields("User", nestedSelect)
      ).not.toThrow();
    });
  });

  it("handles mixed include and select with circular relations", () => {
    const selected = graph.parseSelectedFields("User", {
      include: {
        posts: {
          select: {
            title: true,
            comments: {
              include: {
                post: {
                  include: {
                    author: true, // This gets back to User
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(selected.fields).toEqual(new Set([]));

    const postsFields = selected.nested.get("posts")!;
    expect(postsFields.fields).toEqual(new Set(["title"]));

    const commentsFields = postsFields.nested.get("comments")!;
    expect(commentsFields.fields).toEqual(new Set([]));

    const postFields = commentsFields.nested.get("post")!;
    expect(postFields.fields).toEqual(new Set([]));

    const authorFields = postFields.nested.get("author")!;
    expect(authorFields.fields).toEqual(
      new Set(["id", "email", "name", "bio", "age"])
    );
  });
});
