// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

const noop = () => { throw new Error("fs is not available in React Native"); };
module.exports = new Proxy({}, { get: () => noop });
