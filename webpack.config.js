// // @ts-check
'use strict';

const path = require('path');
const semver = require('semver');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const CleanPlugin = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

// @ts-ignore
const pkg = require('./package.json');

const copyPluginConfig = [
  {
    from: 'node_modules/bulma/css/bulma.min.css',
    to: 'css'
  },
  {
    from: 'node_modules/bulma-switch/dist/css/bulma-switch.min.css',
    to: 'css'
  },
  {
    from: 'node_modules/bulma-divider/dist/css/bulma-divider.min.css',
    to: 'css'
  },
  {
    from: 'node_modules/bulma-checkradio/dist/css/bulma-checkradio.min.css',
    to: 'css'
  },
  {
    from: 'node_modules/@mdi/font/css/materialdesignicons.min.css',
    to: 'css'
  },
  {
    from: 'node_modules/@mdi/font/fonts/materialdesignicons-webfont.woff2',
    to: 'fonts'
  }
];

function getWebviewConfig(env) {
  const moduleRules = [
    {
      test: /\.tsx?$/,
      use: [
        {
          loader: 'ts-loader',
          options: {
            configFile: 'src/webviews/tsconfig.json'
          }
        }
      ],
      exclude: /node_modules|\.d\.ts$/
    }
  ];

  if (env.production) {
    moduleRules.push({
      test: /\.ts$/,
      enforce: 'pre',
      use: [
        {
          loader: 'tslint-loader',
          options: {
            typeCheck: true,
            tsConfigFile: 'src/webviews/tsconfig.json'
          }
        }
      ],
      exclude: /node_modules/
    });
  }

  return {
    name: 'webviews',
    context: path.resolve(__dirname, 'src/webviews'),
    entry: {
      emulators: ['./emulators/index.ts']
    },
    mode: env.production ? 'production' : 'development',
    devtool: env.production ? undefined : 'eval-source-map',
    output: {
      libraryTarget: 'global',
      filename: '[name].js',
      path: path.resolve(__dirname, 'dist/webviews')
      // publicPath: '{{root}}/dist/webviews/'
    },
    module: {
      rules: moduleRules
    },
    resolve: {
      extensions: ['.ts', '.js']
      // modules: [path.resolve(__dirname, 'src/webviews'), 'node_modules']
    },
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
      EXTENSION_VERSION: JSON.stringify(extVersion),
      EXTENSION_NAME: JSON.stringify('vscode.' + pkg.name)
    }),
    new CopyPlugin(copyPluginConfig)
  ];

  const moduleRules = [
    {
      test: /\.tsx?$/,
      use: {
        loader: 'ts-loader',
        options: {
          onlyCompileBundledFiles: true,
          configFile: 'tsconfig.json'
        }
      },
      exclude: /node_modules|\.d\.ts$/
    }
  ];

  if (env.production) {
    moduleRules.push({
      test: /\.ts$/,
      enforce: 'pre',
      use: {
        loader: 'tslint-loader',
        options: {
          tsConfigFile: 'tsconfig.json',
          typeCheck: true
        }
      },
      exclude: /node_modules/
    });
  }

  return {
    name: 'extension',
    entry: './src/extension.ts',
    mode: env.production ? 'production' : 'development',
    target: 'node',
    node: {
      __dirname: false
    },
    devtool: env.production ? 'source-map' : 'cheap-module-eval-source-map',
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
      bufferutil: 'undefined',
      'utf-8-validate': 'undefined'
    },
    module: {
      rules: moduleRules
    },
    resolve: {
      extensions: ['.ts', '.js']
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

module.exports = function(env, argv) {
  env = env || {};
  env.production = Boolean(env.production);
  return [getExtensionConfig(env), getWebviewConfig(env)];
};
