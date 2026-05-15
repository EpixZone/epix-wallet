module.exports = {
  testEnvironment: "node",
  watchman: false,
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.check.json" }],
  },
  moduleNameMapper: {
    "^@keplr-wallet/(common|crypto|mobx-utils|simple-fetch|stores|types|unit)$":
      "<rootDir>/../$1/src",
  },
  testMatch: ["**/src/**/?(*.)+(spec|test).[jt]s?(x)"],
};
