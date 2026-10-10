"use strict";

// Live state for the desktop window and the inference process. Kept in one
// module so the IPC handlers, the log forwarder, and the window's close
// handler cannot each end up holding a different copy.

const state = {
  win: null,
  child: null,
  // True once the user pressed Stop, so the next exit is not reported as a
  // crash.
  stopping: false,
};

module.exports = {
  getWin: () => state.win,
  setWin: (win) => {
    state.win = win;
  },
  getChild: () => state.child,
  setChild: (child) => {
    state.child = child;
  },
  isStopping: () => state.stopping,
  setStopping: (stopping) => {
    state.stopping = stopping;
  },
};
