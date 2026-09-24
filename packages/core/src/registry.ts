import { describeTool, type ToolDescriptor } from './describe.js';
import { ErrorCode, RegistryError } from './errors.js';
import { executeTool, type ExecuteOptions, type ExecutionObserver, type ToolResult } from './execute.js';
import { assertValidModule, type Module } from './module.js';
import type { AnyTool } from './tool.js';

export interface RegisteredTool {
  /** Fully-qualified name: `<moduleId>.<toolName>`. */
  readonly name: string;
  readonly moduleId: string;
  readonly tool: AnyTool;
}

export interface ModuleInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  toolCount: number;
  tools: string[];
}

export interface ToolRegistryOptions {
  /** Receives an execution record after every `execute` call. */
  observer?: ExecutionObserver;
  /** Include raw input values in execution records. Default false. */
  logInputs?: boolean;
}

export interface RegisterModuleOptions {
  /** Whether the module's tools are enabled after registration. Default true. */
  enabled?: boolean;
}

export interface ListOptions {
  includeDisabled?: boolean;
  moduleId?: string;
}

interface ModuleEntry {
  module: Module;
  enabled: boolean;
}

/**
 * Holds modules and their tools. Contains no tool-specific logic: it only validates,
 * namespaces, enables/disables, looks up and dispatches.
 */
export class ToolRegistry {
  readonly #modules = new Map<string, ModuleEntry>();
  readonly #tools = new Map<string, RegisteredTool>();
  readonly #disabledTools = new Set<string>();
  readonly #observers = new Set<ExecutionObserver>();
  readonly #logInputs: boolean;

  constructor(options: ToolRegistryOptions = {}) {
    if (options.observer) this.#observers.add(options.observer);
    this.#logInputs = options.logInputs ?? false;
  }

  /** Registers a module. Throws `RegistryError` on invalid modules or name conflicts. */
  register(module: Module, options: RegisterModuleOptions = {}): this {
    assertValidModule(module);
    if (this.#modules.has(module.id)) {
      throw new RegistryError('NAME_CONFLICT', `A module with id "${module.id}" is already registered.`);
    }
    const entries: RegisteredTool[] = module.tools.map((tool) => ({
      name: `${module.id}.${tool.name}`,
      moduleId: module.id,
      tool,
    }));
    for (const entry of entries) {
      if (this.#tools.has(entry.name)) {
        throw new RegistryError('NAME_CONFLICT', `Tool "${entry.name}" is already registered.`);
      }
    }
    this.#modules.set(module.id, { module, enabled: options.enabled ?? true });
    for (const entry of entries) this.#tools.set(entry.name, Object.freeze(entry));
    return this;
  }

  registerAll(modules: readonly Module[], options: RegisterModuleOptions = {}): this {
    for (const module of modules) this.register(module, options);
    return this;
  }

  hasModule(id: string): boolean {
    return this.#modules.has(id);
  }

  getModule(id: string): Module | undefined {
    return this.#modules.get(id)?.module;
  }

  listModules(): ModuleInfo[] {
    return [...this.#modules.values()].map(({ module, enabled }) => ({
      id: module.id,
      name: module.name,
      version: module.version,
      description: module.description,
      enabled,
      toolCount: module.tools.length,
      tools: module.tools.map((t) => `${module.id}.${t.name}`),
    }));
  }

  enableModule(id: string): this {
    this.#requireModule(id).enabled = true;
    return this;
  }

  disableModule(id: string): this {
    this.#requireModule(id).enabled = false;
    return this;
  }

  /** Keeps only the given modules enabled; unknown ids throw. */
  setEnabledModules(ids: readonly string[]): this {
    for (const id of ids) this.#requireModule(id);
    const wanted = new Set(ids);
    for (const [id, entry] of this.#modules) entry.enabled = wanted.has(id);
    return this;
  }

  isModuleEnabled(id: string): boolean {
    return this.#requireModule(id).enabled;
  }

  enableTool(name: string): this {
    this.#requireTool(name);
    this.#disabledTools.delete(name);
    return this;
  }

  disableTool(name: string): this {
    this.#requireTool(name);
    this.#disabledTools.add(name);
    return this;
  }

  /** True if the tool exists, its module is enabled and the tool itself is not disabled. */
  isEnabled(name: string): boolean {
    const entry = this.#tools.get(name);
    if (!entry) return false;
    return (this.#modules.get(entry.moduleId)?.enabled ?? false) && !this.#disabledTools.has(name);
  }

  /** Looks up a tool by fully-qualified name, regardless of enabled state. */
  get(name: string): RegisteredTool | undefined {
    return this.#tools.get(name);
  }

  has(name: string): boolean {
    return this.#tools.has(name);
  }

  /** Lists tools in registration order. Only enabled tools unless `includeDisabled`. */
  list(options: ListOptions = {}): RegisteredTool[] {
    return [...this.#tools.values()].filter(
      (t) =>
        (options.moduleId === undefined || t.moduleId === options.moduleId) &&
        (options.includeDisabled || this.isEnabled(t.name)),
    );
  }

  describe(name: string): ToolDescriptor {
    const entry = this.#requireTool(name);
    const module = this.#modules.get(entry.moduleId)!.module;
    return describeTool(module.id, module.version, entry.tool);
  }

  describeAll(options: ListOptions = {}): ToolDescriptor[] {
    return this.list(options).map((t) => this.describe(t.name));
  }

  /** Subscribes to execution records. Returns an unsubscribe function. */
  onExecution(observer: ExecutionObserver): () => void {
    this.#observers.add(observer);
    return () => this.#observers.delete(observer);
  }

  /**
   * Executes an enabled tool by fully-qualified name. Disabled and unknown tools both
   * return `TOOL_NOT_FOUND` so that hidden tools are indistinguishable from missing ones.
   */
  async execute<O = unknown>(
    name: string,
    input: unknown,
    options: Omit<ExecuteOptions, 'toolName'> = {},
  ): Promise<ToolResult<O>> {
    const entry = this.#tools.get(name);
    if (!entry || !this.isEnabled(name)) {
      this.#notify(
        {
          tool: name,
          inputValidation: 'skipped',
          outputValidation: 'skipped',
          status: 'error',
          errorCode: ErrorCode.TOOL_NOT_FOUND,
          durationMs: 0,
          inputFields: [],
        },
        options.observer,
      );
      return {
        ok: false,
        error: {
          code: ErrorCode.TOOL_NOT_FOUND,
          message: `Unknown or disabled tool "${name}". List available tools and use the exact fully-qualified name.`,
          details: { available: this.list().map((t) => t.name) },
        },
      };
    }
    return executeTool<O>(entry.tool, input, {
      ...options,
      toolName: name,
      logInputs: options.logInputs ?? this.#logInputs,
      observer: (record) => this.#notify(record, options.observer),
    });
  }

  #notify(record: Parameters<ExecutionObserver>[0], extra: ExecutionObserver | undefined): void {
    for (const observer of [...this.#observers, ...(extra ? [extra] : [])]) {
      try {
        observer(record);
      } catch {
        // Observers must never influence tool results.
      }
    }
  }

  #requireModule(id: string): ModuleEntry {
    const entry = this.#modules.get(id);
    if (!entry) throw new RegistryError('UNKNOWN_MODULE', `Unknown module "${id}".`);
    return entry;
  }

  #requireTool(name: string): RegisteredTool {
    const entry = this.#tools.get(name);
    if (!entry) throw new RegistryError('UNKNOWN_TOOL', `Unknown tool "${name}".`);
    return entry;
  }
}

export function createRegistry(modules: readonly Module[] = [], options: ToolRegistryOptions = {}): ToolRegistry {
  return new ToolRegistry(options).registerAll(modules);
}
