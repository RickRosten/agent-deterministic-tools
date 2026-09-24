#!/usr/bin/env node
import { run } from './cli.js';

const code = await run(process.argv.slice(2));
if (code !== undefined) process.exitCode = code;
