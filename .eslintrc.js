module.exports = {
  root: true,
  extends: ['custom'],
  ignorePatterns: [
    'node_modules',
    'dist',
    'build',
    '**/.eslintrc.js',  // Ignore ESLint config files (they use CommonJS)
    '**/jest.config.js',
    '**/webpack.config.js',
    '**/rollup.config.js',
    '**/vite.config.js',
    '**/tailwind.config.js',
    '**/next.config.js',
  ]
};

