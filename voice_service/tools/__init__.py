"""Per-call tool factories.

Each build_*_tools(ctx) returns a list of @function_tool callables that close
over the call's CallContext. Building tools per call (rather than as module
globals) keeps concurrent calls isolated and lets a tool reach the caller's
phone number / backend client without global state.
"""
