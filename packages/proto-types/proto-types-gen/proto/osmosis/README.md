# Osmosis pool manager messages

`poolmanager/v1beta1/tx.proto` and `swap_route.proto` are unmodified copies from
[osmosis-labs/osmosis at `9a3eac7666d60a13a9ddb64db751a3b8a21e9801`](https://github.com/osmosis-labs/osmosis/tree/9a3eac7666d60a13a9ddb64db751a3b8a21e9801/proto/osmosis/poolmanager/v1beta1).
They are distributed under the upstream [Apache-2.0 license](https://github.com/osmosis-labs/osmosis/blob/9a3eac7666d60a13a9ddb64db751a3b8a21e9801/LICENSE).

The existing generator uses `forceLong=string`, preserving uint64 pool IDs and
base-unit coin amounts without JavaScript floating-point conversions. Consumers
must validate route IDs and amounts before encoding; protobuf codecs do not
validate transaction semantics.
