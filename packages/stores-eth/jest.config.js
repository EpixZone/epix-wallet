module.exports = {
  testEnvironment: "node",
  watchman: false,
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.check.json" }],
  },
  moduleNameMapper: {
    "^@keplr-wallet/stores$": "<rootDir>/../stores/src",
  },
  testMatch: ["**/src/**/?(*.)+(spec|test).[jt]s?(x)"],
};
