/**
 * @typedef {Object} Environment
 * @property {boolean} development
 * @property {boolean} production
 * @property {boolean} watch
 */

const fs = require('fs-extra');
const path = require('path');
const webpack = require('webpack');

const BASE_PATH = process.cwd();

const packageJson = require(path.resolve(BASE_PATH, './package.json'));

const loaders = {
  css: {
    loader: 'css-loader'
  },
  style: {
    loader: 'style-loader',
    options: {
      injectType: 'singletonStyleTag',
      insert: 'html'
    }
  }
};

const plugins = {
  clean: require('clean-webpack-plugin').CleanWebpackPlugin,
  progressBar: require('progress-bar-webpack-plugin'),

  runAfterBuild: function (callback) {
    this.apply = compiler => {
      compiler.hooks.afterEmit.tap('RunAfterBuild', callback);
    };
  }
};

/**
 * @param {Object} configJson
 * @param {string} browserName
 * @return {string}
 */
function getManifest(configJson, browserName) {
  const manifest = {
    manifest_version: 2,
    name: '__MSG_appName__',
    version: packageJson.version,
    description: '__MSG_appDescription__',
    icons: {
      16: 'images/traktflix-icon-16.png',
      128: 'images/traktflix-icon-128.png'
    },
    background: {
      scripts: [
        'js/lib/browser-polyfill.js',
        'js/background.js'
      ]
    },
    content_scripts: [
      {
        js: [
          'js/lib/browser-polyfill.js',
          'js/content.js'
        ],
        matches: [
          '*://*.netflix.com/*'
        ],
        run_at: 'document_idle'
      }
    ],
    default_locale: 'en',
    optional_permissions: [
      'notifications',
      '*://api.rollbar.com/*',
      '*://script.google.com/*',
      '*://script.googleusercontent.com/*'
    ],
    page_action: {
      default_icon: {
        19: 'images/traktflix-icon-19.png',
        38: 'images/traktflix-icon-38.png'
      },
      default_popup: 'html/popup.html',
      default_title: 'traktflix'
    },
    permissions: [
      'identity',
      'storage',
      'tabs',
      'unlimitedStorage',
      '*://*.netflix.com/*',
      '*://*.trakt.tv/*'
    ],
    web_accessible_resources: [
      'images/traktflix-icon-38.png',
      'images/traktflix-icon-selected-38.png',
      'images/svg/*.svg'
    ]
  };

  switch (browserName) {
    case 'chrome':
      if (configJson.chromeExtensionKey) {
        manifest.key = configJson.chromeExtensionKey;
      }

      manifest.permissions.push('declarativeContent');

      break;
    case 'firefox':
      manifest.optional_permissions.push(
        'cookies',
      );

      if (configJson.firefoxExtensionId) {
        manifest.browser_specific_settings = {
          gecko: {
            id: configJson.firefoxExtensionId
          }
        };
      }

      break;
    default:
      break;
  }

  return JSON.stringify(manifest, null, 2);
}

/**
 * @param {Object} configJson
 */
async function runFinalSteps(configJson) {
  if (!fs.existsSync('./build/chrome/js/lib')) {
    fs.mkdirSync('./build/chrome/js/lib');
  }

  if (!fs.existsSync('./build/firefox/js/lib')) {
    fs.mkdirSync('./build/firefox/js/lib');
  }

  const filesToCopy = [
    {
      from: './node_modules/webextension-polyfill/dist/browser-polyfill.min.js',
      to: './build/chrome/js/lib/browser-polyfill.js',
      flatten: true
    },
    {
      from: './node_modules/webextension-polyfill/dist/browser-polyfill.min.js',
      to: './build/firefox/js/lib/browser-polyfill.js',
      flatten: true
    }
  ];

  for (const fileToCopy of filesToCopy) {
    fs.copyFileSync(fileToCopy.from, fileToCopy.to);
  }

  const foldersToCopy = [
    { from: './src/html', to: './build/chrome/html' },
    { from: './src/_locales', to: './build/chrome/_locales' },
    { from: './build/fonts', to: './build/chrome/fonts' },
    { from: './build/images', to: './build/chrome/images' },
    { from: './src/html', to: './build/firefox/html' },
    { from: './src/_locales', to: './build/firefox/_locales' },
    { from: './build/fonts', to: './build/firefox/fonts' },
    { from: './build/images', to: './build/firefox/images' }
  ];

  for (const folderToCopy of foldersToCopy) {
    fs.copySync(folderToCopy.from, folderToCopy.to);
  }

  const filesToCreate = [
    {
      data: getManifest(configJson, 'chrome'),
      path: './build/chrome/manifest.json'
    },
    {
      data: getManifest(configJson, 'firefox'),
      path: './build/firefox/manifest.json'
    }
  ];

  for (const fileToCreate of filesToCreate) {
    fs.writeFileSync(fileToCreate.path, fileToCreate.data);
  }
}

/**
 * @param {Environment} env
 */
function getWebpackConfig(env) {
  let mode;

  if (env.production) {
    mode = 'production';
  } else if (env.development) {
    mode = 'development';
  } else {
    mode = 'none';
  }

  const configJson = require(path.resolve(BASE_PATH, 'config.json'))[mode];

  return {
    devtool: env.production ? false : 'source-map',
    entry: {
      './chrome/js/background': ['./src/modules/background/index.js'],
      './chrome/js/content': ['./src/modules/content/index.js'],
      './chrome/js/history-sync': ['./src/modules/history-sync/index.js'],
      './chrome/js/options': ['./src/modules/options/index.js'],
      './chrome/js/popup': ['./src/modules/popup/index.js'],
      './firefox/js/background': ['./src/modules/background/index.js'],
      './firefox/js/content': ['./src/modules/content/index.js'],
      './firefox/js/history-sync': ['./src/modules/history-sync/index.js'],
      './firefox/js/options': ['./src/modules/options/index.js'],
      './firefox/js/popup': ['./src/modules/popup/index.js'],
    },
    mode,
    module: {
      rules: [
        {
          test: /settings\.js$/,
          loader: 'string-replace-loader',
          options: {
            multiple: [
              { search: '@@clientId', replace: configJson.clientId },
              { search: '@@clientSecret', replace: configJson.clientSecret },
              { search: '@@rollbarToken', replace: configJson.rollbarToken },
              { search: '@@tmdbApiKey', replace: configJson.tmdbApiKey }
            ]
          }
        },
        {
          test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
          loader: 'file-loader',
          options: {
            name: '[name].[ext]',
            outputPath: './fonts',
            publicPath: '../fonts/'
          }
        },
        {
          test: /\.(jpg|png)$/,
          loader: 'file-loader',
          options: {
            name: '[name].[ext]',
            outputPath: './images/',
            publicPath: '../images/'
          }
        },
        {
          test: /\.css$/,
          loaders: [loaders.style, loaders.css]
        },
        {
          test: /\.jsx?$/,
          exclude: /(node_modules|bower_components)/,
          loader: 'babel-loader',
          options: {
            envName: env.test ? 'test' : mode,
            presets: [
              '@babel/preset-env',
              '@babel/preset-react'
            ]
          }
        }
      ]
    },
    output: {
      filename: '[name].js',
      path: path.resolve(BASE_PATH, 'build')
    },
    plugins: [
      new plugins.clean(),
      new plugins.progressBar(),
      ...(
        env.test ? [] : [new plugins.runAfterBuild(() => runFinalSteps(configJson))]
      )
    ],
    watch: !!(env.development && env.watch),
    watchOptions: {
      aggregateTimeout: 1000,
      ignored: /node_modules/,
      poll: 1000
    }
  };
}

module.exports = getWebpackConfig;