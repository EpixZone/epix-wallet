module.exports = {
  testEnvironment: "node",
  watchman: false,
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.check.json" }],
  },
  testMatch: ["**/src/**/?(*.)+(spec|test).[jt]s?(x)"],
};
