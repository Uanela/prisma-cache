import { toKebab } from "../casing";

describe("toKebab", () => {
  test("converts camelCase to kebab-case", () => {
    expect(toKebab("camelCase")).toBe("camel-case");
    expect(toKebab("simpleTestCase")).toBe("simple-test-case");
  });

  test("handles PascalCase", () => {
    expect(toKebab("PascalCase")).toBe("pascal-case");
    expect(toKebab("LongPascalCaseString")).toBe("long-pascal-case-string");
  });

  test("handles already kebab-case", () => {
    expect(toKebab("already-kebab")).toBe("already-kebab");
  });

  test("handles snake_case", () => {
    expect(toKebab("snake_case")).toBe("snake-case");
    expect(toKebab("multiple_snake_case_words")).toBe(
      "multiple-snake-case-words"
    );
  });

  test("handles spaces", () => {
    expect(toKebab("hello world")).toBe("hello-world");
    expect(toKebab("multiple   spaces here")).toBe("multiple-spaces-here");
  });

  test("handles mixed separators", () => {
    expect(toKebab("mixed_case WithSpaces")).toBe("mixed-case-with-spaces");
    expect(toKebab("mixed_CaseWith Spaces")).toBe("mixed-case-with-spaces");
  });

  test("handles consecutive uppercase letters", () => {
    expect(toKebab("APIResponse")).toBe("apiresponse");
    expect(toKebab("getHTTPResponse")).toBe("get-httpresponse");
  });

  test("handles numbers", () => {
    expect(toKebab("version1Test")).toBe("version1-test");
    expect(toKebab("test123Number")).toBe("test123-number");
  });

  test("handles leading and trailing spaces", () => {
    expect(toKebab("  helloWorld  ")).toBe("--hello-world--");
  });

  test("handles empty string", () => {
    expect(toKebab("")).toBe("");
  });

  test("handles single character", () => {
    expect(toKebab("A")).toBe("a");
    expect(toKebab("z")).toBe("z");
  });

  test("handles only separators", () => {
    expect(toKebab("___")).toBe("-");
    expect(toKebab("   ")).toBe("-");
  });

  test("handles complex string", () => {
    expect(toKebab("ThisIs_a VeryComplexString123Test")).toBe(
      "this-is-a-very-complex-string123-test"
    );
  });

  test("idempotency", () => {
    const input = "someRandomString";
    expect(toKebab(toKebab(input))).toBe(toKebab(input));
  });

  test("no mutation of original string", () => {
    const input = "HelloWorld";
    toKebab(input);
    expect(input).toBe("HelloWorld");
  });

  it("handles string with no leading spaces (fallback branch)", () => {
    expect(toKebab("helloWorld")).toBe("hello-world");
  });

  it("handles string with no trailing spaces (fallback branch)", () => {
    expect(toKebab("helloWorld")).toBe("hello-world");
  });

  it("handles trailing that results in slice to end", () => {
    expect(toKebab("a ")).toBe("a-");
  });
});
