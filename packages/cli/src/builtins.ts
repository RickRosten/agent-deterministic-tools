import type { Module } from '@rickrosten/agent-deterministic-tools-core';
import { datetimeModule } from '@rickrosten/agent-deterministic-tools-datetime';
import { financeModule } from '@rickrosten/agent-deterministic-tools-finance';
import { mathModule } from '@rickrosten/agent-deterministic-tools-math';
import { statisticsModule } from '@rickrosten/agent-deterministic-tools-statistics';
import { unitsModule } from '@rickrosten/agent-deterministic-tools-units';

/** Official modules shipped with the CLI, in display order. */
export const BUILTIN_MODULES: readonly Module[] = Object.freeze([
  mathModule,
  financeModule,
  statisticsModule,
  datetimeModule,
  unitsModule,
]);

export const BUILTIN_MODULE_IDS: readonly string[] = Object.freeze(BUILTIN_MODULES.map((m) => m.id));
