import type {
  GraphileFieldConfig,
  GraphileFieldConfigArgumentMap,
  PromiseOrDirect,
} from "grafast";
import type { AsyncHooks, PluginHook } from "graphile-config";
import type {
  GraphQLEnumTypeConfig,
  GraphQLEnumValueConfig,
  GraphQLEnumValueConfigMap,
  GraphQLFieldConfig,
  GraphQLFieldConfigArgumentMap,
  GraphQLFieldConfigMap,
  GraphQLInputFieldConfig,
  GraphQLInputFieldConfigMap,
  GraphQLInterfaceType,
  GraphQLNamedType,
  GraphQLObjectType,
  GraphQLScalarTypeConfig,
  GraphQLSchema,
  GraphQLSchemaConfig,
} from "graphql";

/**
 * The details in the 'info' object passed as the first argument to all gather
 * hooks and helpers.
 */
export interface GatherPluginContext<
  TState extends { [key: string]: any },
  TCache extends { [key: string]: any },
> {
  /**
   * The (completed) inflection object, to help you name things your data
   * gathering produces.
   */
  inflection: GraphileBuild.Inflection;

  /**
   * The 'gather' phase options from the resolved preset.
   */
  options: GraphileBuild.GraphileBuildGatherOptions;

  /**
   * The full resolved preset (generally you'll want `options` instead).
   */
  resolvedPreset: GraphileConfig.ResolvedPreset;

  /**
   * The `helpers` that all the gather plugins make available to you.
   */
  helpers: GraphileConfig.GatherHelpers;

  /**
   * The state for this plugin specifically. State exists only for a single
   * 'gather' phase and is then discarded.
   */
  state: TState;

  /**
   * The cache for this plugin specifically. The cache persists between
   * multiple 'gather' phases and can be a useful place to cache expensive
   * computation so later builds are faster. NOTE: cache is _not_ persisted, it
   * only exists whilst the code is in memory.
   */
  cache: TCache;

  /**
   * Triggers the given hook with the given event (used to broadcast to other
   * gather plugins so they can make their own changes/additions).
   */
  process: AsyncHooks<GraphileConfig.GatherHooks>["process"];
}

declare global {
  namespace GraphileConfig {
    interface Preset {
      inflection?: GraphileBuild.GraphileBuildInflectionOptions;
      gather?: GraphileBuild.GraphileBuildGatherOptions;
      schema?: GraphileBuild.GraphileBuildSchemaOptions;
    }

    interface PluginInflectionConfig {
      /**
       * Define new inflectors here
       */
      add?: {
        [key in keyof GraphileBuild.Inflection]?: (
          this: GraphileBuild.Inflection,
          // TODO: should we wrap this in an object to allow future expansion?
          options: Preset,
          ...args: Parameters<GraphileBuild.Inflection[key]>
        ) => ReturnType<GraphileBuild.Inflection[key]>;
      };

      /**
       * Overwrite existing inflectors here.
       */
      replace?: {
        [key in keyof GraphileBuild.Inflection]?: (
          this: GraphileBuild.Inflection,
          previous: GraphileBuild.Inflection[key] | undefined,
          options: Preset,
          ...args: Parameters<GraphileBuild.Inflection[key]>
        ) => ReturnType<GraphileBuild.Inflection[key]>;
      };

      /**
       * If set and you attempt to replace a non-existent inflector of one of
       * the given names, we won't warn you.
       */
      ignoreReplaceIfNotExists?: Array<keyof GraphileBuild.Inflection>;
    }

    interface GatherHelpers {
      // Extend this with declaration merging
    }

    interface GatherHooks {
      // Extend this with declaration merging
    }

    interface PluginGatherConfig<
      TNamespace extends keyof GatherHelpers,
      TState extends { [key: string]: any } = { [key: string]: any },
      TCache extends { [key: string]: any } = { [key: string]: any },
    > {
      /**
       * A unique namespace for this plugin to use.
       */
      namespace?: TNamespace;

      /**
       * If this plugin supports a persistant internal state (aka a cache, this
       * is an optimisation for watch mode), this returns the value to initialise
       * this cache to.
       */
      initialCache?: () => TCache;

      /**
       * The initial value to use for this plugin when a new gather run
       * executes.
       */
      initialState?: () => TState;

      /**
       * The plugin must register helpers to allow other plugins to access its
       * internal state. (Just use an empty object if you don't need any.)
       */
      helpers?: {
        [key in keyof GatherHelpers[TNamespace]]: GatherHelpers[TNamespace][key] extends (
          ...args: infer UArgs
        ) => infer UReturnType
          ? (
              info: GatherPluginContext<TState, TCache>,
              ...args: UArgs
            ) => UReturnType
          : never;
      };

      hooks?: {
        [key in keyof GatherHooks]?: GatherHooks[key] extends PluginHook<
          infer U
        >
          ? (
              info: GatherPluginContext<TState, TCache>,
              ...args: Parameters<U>
            ) => ReturnType<U>
          : never;
      };

      /**
       * Responsible for kicking off the data collection - ask for data from
       * other plugins (or your own helpers), write data needed by the 'schema'
       * phase to the 'output' object.
       */
      main?: (
        output: Partial<GraphileBuild.BuildInput>,
        info: GatherPluginContext<TState, TCache>,
      ) => Promise<void>;

      /**
       * Called when the plugin is put into watch mode; the plugin should call
       * the given callback whenever a change is detected, and should return a
       * function that prevents this behaviour.
       */
      watch?: (
        info: GatherPluginContext<TState, TCache>,
        callback: () => void,
      ) => PromiseOrDirect<() => void>;
    }

    interface Plugin {
      inflection?: PluginInflectionConfig;

      gather?: PluginGatherConfig<keyof GatherHelpers, any, any>;

      schema?: {
        hooks?: {
          /**
           * The build object represents the current schema build and is passed to all
           * hooks, hook the 'build' event to extend this object. Note: you MUST NOT
           * generate GraphQL objects during this phase.
           */
          build?: PluginHook<
            GraphileBuild.Hook<
              Partial<GraphileBuild.Build> & GraphileBuild.BuildBase,
              GraphileBuild.ContextBuild,
              Partial<GraphileBuild.Build> & GraphileBuild.BuildBase
            >
          >;

          /**
           * The `init` phase runs after `build` is complete but before any types
           * or the schema are actually built. It is the only phase in which you
           * can register GraphQL types; do so using `build.registerType`.
           */
          init?: PluginHook<
            GraphileBuild.Hook<
              Record<string, never>,
              GraphileBuild.ContextInit,
              GraphileBuild.Build
            >
          >;

          /**
           * 'finalize' phase is called once the schema is built; typically you
           * shouldn't use this, but it's useful for interfacing with external
           * libraries that mutate an already constructed schema.
           */
          finalize?: PluginHook<
            GraphileBuild.Hook<
              GraphQLSchema,
              GraphileBuild.ContextFinalize,
              GraphileBuild.Build
            >
          >;

          /**
           * Add 'query', 'mutation' or 'subscription' types in this hook:
           */
          GraphQLSchema?: PluginHook<
            GraphileBuild.Hook<
              GraphQLSchemaConfig,
              GraphileBuild.ContextSchema,
              GraphileBuild.Build
            >
          >;

          /**
           * Add any types that need registering (typically polymorphic types) here
           */
          GraphQLSchema_types?: PluginHook<
            GraphileBuild.Hook<
              GraphQLNamedType[],
              GraphileBuild.ContextSchema,
              GraphileBuild.Build
            >
          >;

          /**
           * When creating a GraphQLObjectType via `newWithHooks`, we'll
           * execute, the following hooks:
           * - 'GraphQLObjectType' to add any root-level attributes, e.g. add a description
           * - 'GraphQLObjectType_interfaces' to add additional interfaces to this object type
           * - 'GraphQLObjectType_fields' to add additional fields to this object type (is
           *   ran asynchronously and gets a reference to the final GraphQL Object as
           *   `Self` in the context)
           * - 'GraphQLObjectType_fields_field' to customize an individual field from above
           * - 'GraphQLObjectType_fields_field_args' to customize the arguments to a field
           */
          GraphQLObjectType?: PluginHook<
            GraphileBuild.Hook<
              GraphileBuild.GraphileObjectTypeConfig<any, any>,
              GraphileBuild.ContextObject,
              GraphileBuild.Build
            >
          >;
          GraphQLObjectType_interfaces?: PluginHook<
            GraphileBuild.Hook<
              GraphQLInterfaceType[],
              GraphileBuild.ContextObjectInterfaces,
              GraphileBuild.Build
            >
          >;
          GraphQLObjectType_fields?: PluginHook<
            GraphileBuild.Hook<
              GraphileBuild.GraphileFieldConfigMap<any, any>,
              GraphileBuild.ContextObjectFields,
              GraphileBuild.Build
            >
          >;
          GraphQLObjectType_fields_field?: PluginHook<
            GraphileBuild.Hook<
              GraphileFieldConfig<any, any, any, any, any>,
              GraphileBuild.ContextObjectFieldsField,
              GraphileBuild.Build
            >
          >;
          GraphQLObjectType_fields_field_args?: PluginHook<
            GraphileBuild.Hook<
              GraphileFieldConfigArgumentMap<any, any, any, any>,
              GraphileBuild.ContextObjectFieldsFieldArgs,
              GraphileBuild.Build
            >
          >;

          /**
           * When creating a GraphQLInputObjectType via `newWithHooks`, we'll
           * execute, the following hooks:
           * - 'GraphQLInputObjectType' to add any root-level attributes, e.g. add a description
           * - 'GraphQLInputObjectType_fields' to add additional fields to this object type (is
           *   ran asynchronously and gets a reference to the final GraphQL Object as
           *   `Self` in the context)
           * - 'GraphQLInputObjectType_fields_field' to customize an individual field from above
           */
          GraphQLInputObjectType?: PluginHook<
            GraphileBuild.Hook<
              GraphileBuild.GraphileInputObjectTypeConfig,
              GraphileBuild.ContextInputObject,
              GraphileBuild.Build
            >
          >;
          GraphQLInputObjectType_fields?: PluginHook<
            GraphileBuild.Hook<
              GraphQLInputFieldConfigMap,
              GraphileBuild.ContextInputObjectFields,
              GraphileBuild.Build
            >
          >;
          GraphQLInputObjectType_fields_field?: PluginHook<
            GraphileBuild.Hook<
              GraphQLInputFieldConfig,
              GraphileBuild.ContextInputObjectFieldsField,
              GraphileBuild.Build
            >
          >;

          /**
           * When creating a GraphQLEnumType via `newWithHooks`, we'll
           * execute, the following hooks:
           * - 'GraphQLEnumType' to add any root-level attributes, e.g. add a description
           * - 'GraphQLEnumType_values' to add additional values
           * - 'GraphQLEnumType_values_value' to change an individual value
           */
          GraphQLEnumType?: PluginHook<
            GraphileBuild.Hook<
              GraphQLEnumTypeConfig,
              GraphileBuild.ContextEnum,
              GraphileBuild.Build
            >
          >;
          GraphQLEnumType_values?: PluginHook<
            GraphileBuild.Hook<
              GraphQLEnumValueConfigMap,
              GraphileBuild.ContextEnumValues,
              GraphileBuild.Build
            >
          >;
          GraphQLEnumType_values_value?: PluginHook<
            GraphileBuild.Hook<
              GraphQLEnumValueConfig,
              GraphileBuild.ContextEnumValuesValue,
              GraphileBuild.Build
            >
          >;

          /**
           * When creating a GraphQLUnionType via `newWithHooks`, we'll
           * execute, the following hooks:
           * - 'GraphQLUnionType' to add any root-level attributes, e.g. add a description
           * - 'GraphQLUnionType_types' to add additional types to this union
           */
          GraphQLUnionType?: PluginHook<
            GraphileBuild.Hook<
              GraphileBuild.GraphileUnionTypeConfig<any, any>,
              GraphileBuild.ContextUnion,
              GraphileBuild.Build
            >
          >;
          GraphQLUnionType_types?: PluginHook<
            GraphileBuild.Hook<
              GraphQLObjectType[],
              GraphileBuild.ContextUnionTypes,
              GraphileBuild.Build
            >
          >;

          /**
           * When creating a GraphQLInterfaceType via `newWithHooks`, we'll
           *  execute, the following hooks:
           *  - 'GraphQLInterfaceType' to add any root-level attributes, e.g. add a description
           *  - 'GraphQLInterfaceType_fields' to add additional fields to this interface type (is
           *    ran asynchronously and gets a reference to the final GraphQL Interface as
           *    `Self` in the context)
           *  - 'GraphQLInterfaceType_fields_field' to customise an individual field from above
           *  - 'GraphQLInterfaceType_fields_field_args' to customize the arguments to a field
           */
          GraphQLInterfaceType?: PluginHook<
            GraphileBuild.Hook<
              GraphileBuild.GraphileInterfaceTypeConfig<any, any>,
              GraphileBuild.ContextInterface,
              GraphileBuild.Build
            >
          >;
          GraphQLInterfaceType_fields?: PluginHook<
            GraphileBuild.Hook<
              GraphQLFieldConfigMap<any, any>,
              GraphileBuild.ContextInterfaceFields,
              GraphileBuild.Build
            >
          >;
          GraphQLInterfaceType_fields_field?: PluginHook<
            GraphileBuild.Hook<
              GraphQLFieldConfig<any, any>,
              GraphileBuild.ContextInterfaceFieldsField,
              GraphileBuild.Build
            >
          >;
          GraphQLInterfaceType_fields_field_args?: PluginHook<
            GraphileBuild.Hook<
              GraphQLFieldConfigArgumentMap,
              GraphileBuild.ContextInterfaceFieldsFieldArgs,
              GraphileBuild.Build
            >
          >;
          GraphQLInterfaceType_interfaces?: PluginHook<
            GraphileBuild.Hook<
              GraphQLInterfaceType[],
              GraphileBuild.ContextInterfaceInterfaces,
              GraphileBuild.Build
            >
          >;

          /**
           * For scalars
           */
          GraphQLScalarType?: PluginHook<
            GraphileBuild.Hook<
              GraphQLScalarTypeConfig<any, any>,
              GraphileBuild.ContextScalar,
              GraphileBuild.Build
            >
          >;
        };
      };
    }
  }
}