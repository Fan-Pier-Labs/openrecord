// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          unstable_transformImportMeta: true,
        },
      ],
    ],
  };
};
