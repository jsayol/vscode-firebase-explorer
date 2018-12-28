// // @ts-check
'use strict';

const semver = require('semver');
const webpack = require('webpack');
const CleanPlugin = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

// @ts-ignore
const pkg = require('./package.json');

module.exports = function(env, argv) {
  env = env || {};
  env.production = Boolean(env.production);
  return [getExtensionConfig(env)];
};

function getExtensionConfig(env) {
  const clean = ['dist'];

  const extVersion = env.production
    ? pkg.version
    : semver.inc(pkg.version, 'prerelease', 'dev');

  const plugins = [
    new CleanPlugin(clean, { verbose: false }),
    new webpack.IgnorePlugin(/^spawn-sync$/),
    new webpack.DefinePlugin({
      PRODUCTION: JSON.stringify(env.production),
      EXTENSION_VERSION: JSON.stringify(extVersion)
    })
  ];

  return {
    name: 'extension',
    entry: './src/extension.ts',
    mode: env.production ? 'production' : 'development',
    target: 'node',
    node: {
      __dirname: false
    },
    devtool: 'source-map',
    output: {
      libraryTarget: 'commonjs2',
      filename: 'extension.js',
      devtoolModuleFilenameTemplate: 'file:///[absolute-resource-path]'
    },
    optimization: {
      minimizer: [
        new TerserPlugin({
          cache: true,
          parallel: true,
          sourceMap: true,
          terserOptions: {
            ecma: 8,
            module: true
          }
        })
      ]
    },
    externals: {
      vscode: 'commonjs vscode',

      // Imported by request#tough-cookie but unnecessary, since it's
      // only needed when calling toughCookie.getPublicSuffix() and
      // "request" doesn't call it.
      psl: 'psl',

      // Imported by "request". This in turn imports "ajv". Both are
      // unnecessary since we're not using options.har in request.
      'har-validator': 'har-validator'
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          enforce: 'pre',
          use: [
            {
              loader: 'tslint-loader',
              options: {
                typeCheck: true
              }
            }
          ],
          exclude: /node_modules/
        },
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules|\.d\.ts$/
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx']
    },
    plugins: plugins,
    stats: {
      all: false,
      assets: true,
      builtAt: true,
      env: true,
      errors: true,
      timings: true,
      warnings: true
    }
  };
}
