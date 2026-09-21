/**
 * WeekDraft — single owner of Sign Up day draft state.
 *
 * Unifies the former 4-axis spaghetti (selected / focused / server-signed /
 * pending-cancel) into one model with explicit transitions. Hydrate is sacred:
 * callers must not call hydrateFromServer while dirty is true unless they
 * intentionally clear first.
 *
 * No bundler: served as a plain script. Works in browser (window.weekDraft)
 * and Node (module.exports) for unit tests.
 */
(function (global) {
  'use strict';

  function cloneJson(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function clearObject(obj) {
    Object.keys(obj).forEach(function (key) { delete obj[key]; });
  }

  function WeekDraft() {
    this.selectedDays = new Set();
    this.selectedTimes = {};
    this.dayOptions = {};
    this.focusedDay = null;
    this.dirty = false;
    this._pendingCancels = new Set();
    this._cancelData = {};
  }

  WeekDraft.prototype.markDirty = function () {
    this.dirty = true;
  };

  WeekDraft.prototype.clearDirty = function () {
    this.dirty = false;
  };

  WeekDraft.prototype.isDirty = function () {
    return !!this.dirty;
  };

  WeekDraft.prototype.hasPendingCancel = function (dayIdx) {
    return this._pendingCancels.has(dayIdx);
  };

  WeekDraft.prototype.pendingCancelCount = function () {
    return this._pendingCancels.size;
  };

  WeekDraft.prototype.pendingCancelDays = function () {
    return Array.from(this._pendingCancels);
  };

  WeekDraft.prototype.getCancelData = function (dayIdx) {
    return this._cancelData[dayIdx] || null;
  };

  /** Lowest selected day index, or null. */
  WeekDraft.prototype.firstSelected = function () {
    if (!this.selectedDays.size) return null;
    return Array.from(this.selectedDays).sort(function (a, b) { return a - b; })[0];
  };

  WeekDraft.prototype.refocusAfterRemoved = function (dayIdx) {
    if (this.focusedDay === dayIdx) {
      this.focusedDay = this.firstSelected();
    }
  };

  /** Snapshot of editable draft axes (not in-flight pending cancels). */
  WeekDraft.prototype.snapshot = function () {
    return {
      selectedDays: new Set(this.selectedDays),
      selectedTimes: Object.assign({}, this.selectedTimes),
      dayOptions: cloneJson(this.dayOptions),
      focusedDay: this.focusedDay,
      dirty: this.dirty
    };
  };

  WeekDraft.prototype.restore = function (draft) {
    if (!draft) return;
    this.selectedDays.clear();
    (draft.selectedDays instanceof Set
      ? Array.from(draft.selectedDays)
      : (draft.selectedDays || [])
    ).forEach(function (i) { this.selectedDays.add(i); }.bind(this));
    clearObject(this.selectedTimes);
    Object.assign(this.selectedTimes, draft.selectedTimes || {});
    clearObject(this.dayOptions);
    Object.assign(this.dayOptions, cloneJson(draft.dayOptions) || {});
    this.focusedDay = draft.focusedDay != null ? draft.focusedDay : null;
    if (typeof draft.dirty === 'boolean') this.dirty = draft.dirty;
  };

  /** Clear selection / focus / day options (keeps pending cancels). */
  WeekDraft.prototype.clearSelection = function () {
    this.selectedDays.clear();
    clearObject(this.selectedTimes);
    clearObject(this.dayOptions);
    this.focusedDay = null;
  };

  /** Full reset including pending cancels and dirty. */
  WeekDraft.prototype.reset = function () {
    this.clearSelection();
    this._pendingCancels.clear();
    clearObject(this._cancelData);
    this.dirty = false;
  };

  /**
   * Rebuild selection from server signups for myName.
   * Skips days with an in-flight pending cancel.
   * opts: { config, signups, myName, normalizeGuests, extractAccommodations }
   */
  WeekDraft.prototype.hydrateFromServer = function (opts) {
    this.clearSelection();
    var myName = opts && opts.myName;
    if (!myName || !opts.config) return;

    var normalizeGuests = opts.normalizeGuests || function () { return []; };
    var extractAccommodations = opts.extractAccommodations || function () { return ''; };
    var signedIdxs = [];
    var self = this;

    opts.config.forEach(function (day, i) {
      if (!day.enabled || self._pendingCancels.has(i)) return;
      var mine = (opts.signups[i] || []).find(function (s) {
        return s.name && s.name.toLowerCase().trim() === myName;
      });
      if (!mine) return;
      self.selectedDays.add(i);
      signedIdxs.push(i);
      if (mine.time) self.selectedTimes[i] = mine.time;
      var allergiesKnown = Object.prototype.hasOwnProperty.call(mine, 'allergies');
      self.dayOptions[i] = {
        early: mine.early === true || mine.early === 'true' || mine.early === 'TRUE',
        guests: normalizeGuests(mine.guests),
        // When getWeek strips allergies, leave accommodations empty but mark preserve
        // so Update Sign-Ups does not wipe existing kitchen notes.
        accommodations: allergiesKnown ? extractAccommodations(mine.allergies) : '',
        _preserveAllergies: !allergiesKnown
      };
    });
    if (signedIdxs.length) this.focusedDay = signedIdxs[0];
  };

  /** Select a day and focus it (new unsigned pick or re-open). Marks dirty. */
  WeekDraft.prototype.select = function (dayIdx) {
    this.dirty = true;
    this.selectedDays.add(dayIdx);
    this.focusedDay = dayIdx;
  };

  /** Expand details for an already-selected day without deselecting. */
  WeekDraft.prototype.focus = function (dayIdx) {
    this.focusedDay = dayIdx;
  };

  /** Drop a local (unsigned) day from the draft. Marks dirty. */
  WeekDraft.prototype.deselectLocal = function (dayIdx) {
    this.dirty = true;
    this.selectedDays.delete(dayIdx);
    delete this.selectedTimes[dayIdx];
    delete this.dayOptions[dayIdx];
    this.refocusAfterRemoved(dayIdx);
  };

  /**
   * Begin optimistic remove of a signed day.
   * Returns the stored cancel payload (for API / debugging).
   */
  WeekDraft.prototype.beginRemove = function (monday, dayIdx, name, time) {
    this._pendingCancels.add(dayIdx);
    this._cancelData[dayIdx] = {
      monday: monday,
      name: name,
      time: time,
      selectedTime: this.selectedTimes[dayIdx],
      opts: this.dayOptions[dayIdx] ? Object.assign({}, this.dayOptions[dayIdx]) : null
    };
    this.selectedDays.delete(dayIdx);
    delete this.selectedTimes[dayIdx];
    delete this.dayOptions[dayIdx];
    this.refocusAfterRemoved(dayIdx);
    return this._cancelData[dayIdx];
  };

  /**
   * Restore a pending cancel (toast undo OR mid-cancel re-tap). Single owner.
   * Returns true if a pending cancel was restored.
   */
  WeekDraft.prototype.restorePendingCancel = function (dayIdx) {
    if (!this._pendingCancels.has(dayIdx)) return false;
    this._pendingCancels.delete(dayIdx);
    var saved = this._cancelData[dayIdx];
    delete this._cancelData[dayIdx];
    this.selectedDays.add(dayIdx);
    if (saved && saved.selectedTime) this.selectedTimes[dayIdx] = saved.selectedTime;
    else if (saved && saved.time) this.selectedTimes[dayIdx] = saved.time;
    if (saved && saved.opts) this.dayOptions[dayIdx] = saved.opts;
    this.focusedDay = dayIdx;
    return true;
  };

  /** Drop pending cancel after API commit or hard failure. */
  WeekDraft.prototype.clearPendingCancel = function (dayIdx) {
    this._pendingCancels.delete(dayIdx);
    delete this._cancelData[dayIdx];
  };

  /** Keep in-flight cancels for monday; drop stale ones from other weeks. */
  WeekDraft.prototype.pruneStaleCancels = function (monday) {
    var self = this;
    this.pendingCancelDays().forEach(function (dayIdx) {
      var saved = self._cancelData[dayIdx];
      if (!saved || saved.monday !== monday) {
        self.clearPendingCancel(dayIdx);
      }
    });
  };

  WeekDraft.prototype.ensureDayOptions = function (dayIdx) {
    if (!this.dayOptions[dayIdx]) this.dayOptions[dayIdx] = {};
    return this.dayOptions[dayIdx];
  };

  WeekDraft.prototype.setTime = function (dayIdx, time) {
    this.dirty = true;
    this.selectedTimes[dayIdx] = time;
  };

  /** Drop unsigned closed days that slipped into selection. */
  WeekDraft.prototype.dropClosedUnsigned = function (isSignedFn, isOpenFn) {
    var self = this;
    Array.from(this.selectedDays).forEach(function (i) {
      if (!isSignedFn(i) && !isOpenFn(i)) {
        self.selectedDays.delete(i);
        delete self.selectedTimes[i];
        delete self.dayOptions[i];
        self.refocusAfterRemoved(i);
      }
    });
  };

  var singleton = new WeekDraft();
  global.WeekDraft = WeekDraft;
  global.weekDraft = singleton;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WeekDraft: WeekDraft, weekDraft: singleton };
  }
})(typeof window !== 'undefined' ? window : globalThis);
