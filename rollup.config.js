import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import sourceMaps from 'rollup-plugin-sourcemaps';
import typescript from 'rollup-plugin-typescript2';
import json from 'rollup-plugin-json';

export default {
  input: './src/extension.ts',
  output: {
    file: './dist/extension.js',
    format: 'cjs',
    sourcemap: true
  },
  external: [
    'vscode',
    'os',
    'path',
    'http',
    'fs',
    'util',
    'url',
    'child_process',
    'spawn-sync',
    'assert',
    'events',
    'net',
    'stream',
    'crypto',
    'tty',
    'buffer',
    'https',
    'zlib',
    'tls',
    'querystring'
  ],
  plugins: [
    // Compile TypeScript files
    typescript({ useTsconfigDeclarationDir: true }),

    // Allow importing json files
    json(),

    // Allow node_modules resolution, so you can use 'external' to control
    // which external modules to include in the bundle
    // https://github.com/rollup/rollup-plugin-node-resolve#usage
    resolve(),

    // Allow bundling cjs modules (unlike webpack, rollup doesn't understand cjs)
    commonjs({ extensions: ['.js', '.jsx'] }),

    // Resolve source maps to the original source
    sourceMaps()
  ]
};
