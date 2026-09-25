const config = require('./app.json');

module.exports = {
  ...config,
  expo: {
    ...config.expo,
    experiments: {
      ...config.expo.experiments,
      ...(process.env.WEB_BASE_URL
        ? { baseUrl: process.env.WEB_BASE_URL }
        : {}),
    },
  },
};
