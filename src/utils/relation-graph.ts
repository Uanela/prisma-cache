import type { DMMFDatamodel } from "../types";
import * as prismaClient from "@prisma/client";
import { toKebab } from "./casing";

export interface FieldInfo {
  /** The model this field belongs to */
  model: string;
  /** The field name */
  name: string;
  /** The type of the field (prisma type) */
  type: string;
  /** Whether this field is a relation field */
  isRelation: boolean;
  /** If isRelation is true, the related model name */
  relatedModel?: string;
}

export interface SelectedFields {
  /** Fields selected directly on this model */
  fields: Set<string>;
  /** Nested selections for relation fields */
  nested: Map<string, SelectedFields>;
}

export class RelationGraph {
  /** modelName → Set<relatedModelName> */
  private readonly graph: Map<string, Set<string>>;

  /** modelName → Map<fieldName, relatedModelName> */
  private readonly fieldMap: Map<string, Map<string, string>>;

  /** modelName → Map<fieldName, FieldInfo> - Complete field metadata */
  private readonly fieldInfoMap: Map<string, Map<string, FieldInfo>>;

  /** modelName → Set<scalarFieldName> - For quick scalar field lookups */
  private readonly scalarFieldsMap: Map<string, Set<string>>;

  constructor() {
    const datamodel = (prismaClient as any).Prisma.dmmf.datamodel ?? {
      models: [],
    };
    const { graph, fieldMap, fieldInfoMap, scalarFieldsMap } =
      this.build(datamodel);
    this.graph = graph;
    this.fieldMap = fieldMap;
    this.fieldInfoMap = fieldInfoMap;
    this.scalarFieldsMap = scalarFieldsMap;
  }

  private build(datamodel: DMMFDatamodel): {
    graph: Map<string, Set<string>>;
    fieldMap: Map<string, Map<string, string>>;
    fieldInfoMap: Map<string, Map<string, FieldInfo>>;
    scalarFieldsMap: Map<string, Set<string>>;
  } {
    const graph = new Map<string, Set<string>>();
    const fieldMap = new Map<string, Map<string, string>>();
    const fieldInfoMap = new Map<string, Map<string, FieldInfo>>();
    const scalarFieldsMap = new Map<string, Set<string>>();

    for (const model of datamodel.models) {
      const modelName = toKebab(model.name);
      const modelFields = new Map<string, FieldInfo>();
      const scalarFields = new Set<string>();

      if (!graph.has(modelName)) graph.set(modelName, new Set());
      if (!fieldMap.has(modelName)) fieldMap.set(modelName, new Map());

      for (const field of model.fields) {
        const isRelation = !!field.relationName;
        const fieldInfo: FieldInfo = {
          model: modelName,
          name: field.name,
          type: field.type,
          isRelation,
        };

        if (isRelation) {
          const relatedModel = toKebab(field.type);
          fieldInfo.relatedModel = relatedModel;
          graph.get(modelName)!.add(relatedModel);
          fieldMap.get(modelName)!.set(field.name, relatedModel);
        } else {
          scalarFields.add(field.name);
        }

        modelFields.set(field.name, fieldInfo);
      }

      fieldInfoMap.set(modelName, modelFields);
      scalarFieldsMap.set(modelName, scalarFields);
    }

    return { graph, fieldMap, fieldInfoMap, scalarFieldsMap };
  }

  /**
   * Parse a Prisma query args and extract all selected fields
   */
  parseSelectedFields(
    model: string,
    args?: Record<string, unknown>
  ): SelectedFields {
    const result: SelectedFields = {
      fields: new Set(),
      nested: new Map(),
    };

    const includeOrSelect =
      (args?.include as Record<string, unknown> | undefined) ??
      (args?.select as Record<string, unknown> | undefined);

    if (!includeOrSelect) {
      const scalarFields = this.scalarFieldsMap.get(toKebab(model));
      if (scalarFields) {
        scalarFields.forEach((field) => result.fields.add(field));
      }
      return result;
    }

    this.parseSelectObject(toKebab(model), includeOrSelect, result);
    return result;
  }

  private parseSelectObject(
    currentModel: string,
    selectObj: Record<string, unknown>,
    result: SelectedFields
  ): void {
    const modelFields = this.fieldInfoMap.get(currentModel);
    if (!modelFields) return;

    for (const [field, value] of Object.entries(selectObj)) {
      const fieldInfo = modelFields.get(field);
      if (!fieldInfo) continue;

      if (fieldInfo.isRelation) {
        if (value && typeof value === "object" && (value as any) !== true) {
          const nestedObj = value as Record<string, unknown>;

          const nestedResult: SelectedFields = {
            fields: new Set(),
            nested: new Map(),
          };

          const nestedIncludeOrSelect =
            (nestedObj.include as Record<string, unknown> | undefined) ??
            (nestedObj.select as Record<string, unknown> | undefined);

          if (nestedIncludeOrSelect) {
            this.parseSelectObject(
              fieldInfo.relatedModel!,
              nestedIncludeOrSelect,
              nestedResult
            );
          } else if (Object.keys(nestedObj).length > 0) {
            for (const [nestedField, nestedValue] of Object.entries(
              nestedObj
            )) {
              const nestedFieldInfo = this.fieldInfoMap
                .get(fieldInfo.relatedModel!)
                ?.get(nestedField);
              if (nestedFieldInfo) {
                if (!nestedFieldInfo.isRelation && nestedValue === true) {
                  nestedResult.fields.add(nestedField);
                } else if (nestedFieldInfo.isRelation) {
                  const deeperResult: SelectedFields = {
                    fields: new Set(),
                    nested: new Map(),
                  };
                  if (nestedValue === true) {
                    const scalarFields = this.scalarFieldsMap.get(
                      nestedFieldInfo.relatedModel!
                    );
                    if (scalarFields) {
                      scalarFields.forEach((f) => deeperResult.fields.add(f));
                    }
                  } else if (typeof nestedValue === "object") {
                    this.parseSelectObject(
                      fieldInfo.relatedModel!,
                      { [nestedField]: nestedValue },
                      deeperResult
                    );
                  }
                  nestedResult.nested.set(nestedField, deeperResult);
                }
              }
            }
          }

          result.nested.set(field, nestedResult);
        } else if (value === true) {
          const nestedResult: SelectedFields = {
            fields: new Set(),
            nested: new Map(),
          };
          const scalarFields = this.scalarFieldsMap.get(
            fieldInfo.relatedModel!
          );
          if (scalarFields) {
            scalarFields.forEach((f) => nestedResult.fields.add(f));
          }
          result.nested.set(field, nestedResult);
        }
      } else if (value === true) {
        result.fields.add(field);
      }
    }
  }

  /**
   * Check if a write operation affects a cached query result
   */
  shouldInvalidate(
    cachedFields: SelectedFields,
    writeModel: string,
    writeData: Record<string, unknown>
  ): boolean {
    const modelName = toKebab(writeModel);
    return this.checkFieldOverlap(cachedFields, modelName, writeData);
  }

  private checkFieldOverlap(
    selectedFields: SelectedFields,
    currentModel: string,
    writeData: Record<string, unknown>
  ): boolean {
    const modelFieldInfo = this.fieldInfoMap.get(currentModel);
    if (!modelFieldInfo) return false;

    for (const [key, value] of Object.entries(writeData)) {
      const fieldInfo = modelFieldInfo.get(key);

      if (fieldInfo && !fieldInfo.isRelation) {
        if (selectedFields.fields.has(key)) {
          return true;
        }
      } else if (fieldInfo && fieldInfo.isRelation) {
        const nestedSelected = selectedFields.nested.get(key);
        if (nestedSelected && value && typeof value === "object") {
          const nestedWrite = value as Record<string, unknown>;

          if (
            this.checkNestedWrite(
              nestedSelected,
              fieldInfo.relatedModel!,
              nestedWrite
            )
          ) {
            return true;
          }
        }
      } else if (!fieldInfo) {
        if (value && typeof value === "object") {
          const nestedWrite = value as Record<string, unknown>;
          if (
            this.checkFieldOverlap(selectedFields, currentModel, nestedWrite)
          ) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private checkNestedWrite(
    selectedFields: SelectedFields,
    relatedModel: string,
    writeData: Record<string, unknown>
  ): boolean {
    const prismaOperators = [
      "create",
      "createMany",
      "update",
      "updateMany",
      "upsert",
      "delete",
      "deleteMany",
      "connect",
      "disconnect",
      "set",
    ];

    for (const [key, value] of Object.entries(writeData)) {
      if (prismaOperators.includes(key)) {
        if (key === "delete" || key === "deleteMany") {
          return true;
        }

        if (value && typeof value === "object") {
          const dataObj = value as Record<string, unknown>;
          const dataField = dataObj.data;

          if (dataField && typeof dataField === "object") {
            if (
              this.checkFieldOverlap(
                selectedFields,
                relatedModel,
                dataField as Record<string, unknown>
              )
            ) {
              return true;
            }
          } else if (Object.keys(dataObj).length > 0 && !dataObj.data) {
            if (this.checkFieldOverlap(selectedFields, relatedModel, dataObj)) {
              return true;
            }
          }
        }
      } else if (key === "data" && value && typeof value === "object") {
        if (
          this.checkFieldOverlap(
            selectedFields,
            relatedModel,
            value as Record<string, unknown>
          )
        ) {
          return true;
        }
      } else if (key === "where" || key === "by") {
        continue;
      } else if (value && typeof value === "object") {
        if (
          this.checkNestedWrite(
            selectedFields,
            relatedModel,
            value as Record<string, unknown>
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get all fields that would be invalidated by a write operation
   */
  getInvalidatedFields(
    cachedFields: SelectedFields,
    writeModel: string,
    writeData: Record<string, unknown>,
    currentPath: string = ""
  ): Set<string> {
    const invalidated = new Set<string>();
    const modelName = toKebab(writeModel);
    this.collectInvalidatedFields(
      cachedFields,
      modelName,
      writeData,
      currentPath,
      invalidated
    );
    return invalidated;
  }

  private collectInvalidatedFields(
    selectedFields: SelectedFields,
    currentModel: string,
    writeData: Record<string, unknown>,
    currentPath: string,
    invalidated: Set<string>
  ): void {
    const modelFieldInfo = this.fieldInfoMap.get(currentModel);
    if (!modelFieldInfo) return;

    for (const [key, value] of Object.entries(writeData)) {
      const fieldInfo = modelFieldInfo.get(key);
      const fieldPath = currentPath ? `${currentPath}.${key}` : key;

      if (fieldInfo && !fieldInfo.isRelation) {
        if (selectedFields.fields.has(key)) {
          invalidated.add(fieldPath);
        }
      } else if (fieldInfo && fieldInfo.isRelation) {
        const nestedSelected = selectedFields.nested.get(key);
        if (nestedSelected && value && typeof value === "object") {
          const nestedWrite = value as Record<string, unknown>;
          this.collectNestedInvalidations(
            nestedSelected,
            fieldInfo.relatedModel!,
            nestedWrite,
            fieldPath,
            invalidated
          );
        }
      } else if (!fieldInfo && value && typeof value === "object") {
        this.collectInvalidatedFields(
          selectedFields,
          currentModel,
          value as Record<string, unknown>,
          fieldPath,
          invalidated
        );
      }
    }
  }

  private collectNestedInvalidations(
    selectedFields: SelectedFields,
    relatedModel: string,
    writeData: Record<string, unknown>,
    currentPath: string,
    invalidated: Set<string>
  ): void {
    const prismaOperators = [
      "create",
      "createMany",
      "update",
      "updateMany",
      "upsert",
      "delete",
      "deleteMany",
      "connect",
      "disconnect",
      "set",
    ];

    for (const [key, value] of Object.entries(writeData)) {
      if (prismaOperators.includes(key)) {
        if (key === "delete" || key === "deleteMany") {
          invalidated.add(currentPath);
          continue;
        }

        if (value && typeof value === "object") {
          const dataObj = value as Record<string, unknown>;
          const dataField = dataObj.data;

          if (dataField && typeof dataField === "object") {
            this.collectInvalidatedFields(
              selectedFields,
              relatedModel,
              dataField as Record<string, unknown>,
              currentPath,
              invalidated
            );
          } else if (Object.keys(dataObj).length > 0 && !dataObj.data) {
            this.collectInvalidatedFields(
              selectedFields,
              relatedModel,
              dataObj,
              currentPath,
              invalidated
            );
          }
        }
      } else if (key === "data" && value && typeof value === "object") {
        this.collectInvalidatedFields(
          selectedFields,
          relatedModel,
          value as Record<string, unknown>,
          currentPath,
          invalidated
        );
      } else if (key === "where" || key === "by") {
        continue;
      } else if (value && typeof value === "object") {
        this.collectNestedInvalidations(
          selectedFields,
          relatedModel,
          value as Record<string, unknown>,
          `${currentPath}.${key}`,
          invalidated
        );
      }
    }
  }

  /**
   * Get all fields selected in a query
   */
  getSelectedFieldsDebug(
    model: string,
    args?: Record<string, unknown>
  ): string[] {
    const selected = this.parseSelectedFields(model, args);
    const result: string[] = [];

    const collectFields = (prefix: string, fields: SelectedFields) => {
      for (const field of fields.fields) {
        result.push(prefix ? `${prefix}.${field}` : field);
      }
      for (const [relation, nested] of fields.nested) {
        collectFields(prefix ? `${prefix}.${relation}` : relation, nested);
      }
    };

    collectFields("", selected);
    return result;
  }

  /** Get all model names directly related to a given model */
  getRelatedModels(model: string): string[] {
    return [...(this.graph.get(toKebab(model)) ?? [])];
  }

  /**
   * Walk the include/select tree of a prisma query and collect
   * all model names that are transitively included.
   */
  getIncludedModels(model: string, args?: Record<string, unknown>): string[] {
    const included = new Set<string>();
    const includeOrSelect =
      (args?.include as Record<string, unknown> | undefined) ??
      (args?.select as Record<string, unknown> | undefined);

    this.walkIncludes(toKebab(model), includeOrSelect, included);
    return [...included];
  }

  private walkIncludes(
    currentModel: string,
    includeOrSelect: Record<string, unknown> | undefined,
    acc: Set<string>
  ): void {
    if (!includeOrSelect) return;

    const modelFieldMap = this.fieldMap.get(currentModel);
    if (!modelFieldMap) return;

    for (const [field, value] of Object.entries(includeOrSelect)) {
      const relatedModel = modelFieldMap.get(field);
      if (!relatedModel) continue;

      acc.add(relatedModel);

      if (value && typeof value === "object" && (value as unknown) !== true) {
        const nested = value as Record<string, unknown>;
        const nestedInclude =
          (nested.include as Record<string, unknown> | undefined) ??
          (nested.select as Record<string, unknown> | undefined);

        this.walkIncludes(relatedModel, nestedInclude, acc);
      }
    }
  }
}
