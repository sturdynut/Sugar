import NamespaceStore from './NamespaceStore';
import SugarChainableBase from './SugarChainableBase';

import globalContext from './globalContext';
import { extendNative, restoreNative } from './extendUtils';
import { hasOwnProperty, forEachProperty, arrayIncludes } from './utils';


// --- Constants

const SUGAR = 'Sugar';
const ERROR_METHOD_DEFINED  = 'Method already defined';
const ERROR_NATIVE_UNKNOWN  = 'Built-in class does not exist';
const ERROR_EXTEND_CONFLICT = 'Extend options cannot have both include and exclude';
export const VERSION = 'edge';


// --- Setup

const instanceMethods = new NamespaceStore();

export function createNamespace(globalName) {

  if (!globalContext[globalName]) {
    throw new Error(ERROR_NATIVE_UNKNOWN);
  }

  if (Sugar[globalName]) {
    return Sugar[globalName];
  }

  class SugarChainable extends SugarChainableBase {

    static extend(opt) {
      extendNamespace(globalName, opt);
    }

    static defineStatic(...args) {
      return defineWithArgs(globalName, defineStatic, args);
    }

    static defineInstance(...args) {
      return defineWithArgs(globalName, defineInstance, args);
    }

    static defineStaticAlias(str, fn) {
      return defineAliases(globalName, defineStatic, str, fn);
    }

    static defineInstanceAlias(str, fn) {
      return defineAliases(globalName, defineInstance, str, fn);
    }

  }

  mapNativeToChainable(globalName, SugarChainable);

  return Sugar[globalName] = SugarChainable;
}


// --- Defining methods

function defineWithArgs(globalName, defineMethod, args) {
  if (typeof args[0] !== 'object') {
    return defineMethod(globalName, args[0], args[1]);
  }
  forEachProperty(args[0], (methodName, fn) => {
    defineMethod(globalName, methodName, fn);
  });
}

function defineAliases(globalName, defineMethod, str, fn) {
  str.split(/[ ,]/).forEach(methodName => {
    defineMethod(globalName, methodName, fn(methodName));
  });
}

function defineStatic(globalName, methodName, staticFn) {
  const SugarChainable = Sugar[globalName];
  assertMethodDoesNotExist(SugarChainable, methodName);
  // Clear an instance method that previously exists.
  // Sugar will error when redefining methods, so this
  // is mostly for the test suite.
  instanceMethods.remove(globalName, methodName, true);
  SugarChainable[methodName] = staticFn;
}

function defineInstance(globalName, methodName, staticFn) {
  const SugarChainable = Sugar[globalName];
  assertMethodDoesNotExist(SugarChainable, methodName);
  const instanceFn = wrapStaticMethodAsInstance(SugarChainable, staticFn);
  instanceMethods.set(globalName, methodName, instanceFn, true);
  SugarChainable.prototype[methodName] = wrapReturnWithChainable(instanceFn);
  SugarChainable[methodName] = staticFn;
}

function assertMethodDoesNotExist(SugarChainable, methodName) {
  if (SugarChainable[methodName]) {
    throw new Error(ERROR_METHOD_DEFINED);
  }
}

function wrapStaticMethodAsInstance(SugarChainable, fn) {
  return function(...args) {
    args.unshift(this);
    return fn.apply(SugarChainable, args);
  };
}


// --- Extending

export function extend(opt) {
  try {
    opt = collectExtendOptions(opt);
    forEachNamespace(globalName => {
      if (extendIsAllowed(globalName, opt)) {
        extendNamespace(globalName, {
          existing: opt && opt.existing
        });
      }
    });
  } catch (e) {
    restore();
    throw e;
  }
}

export function restore() {
  forEachNamespace(restoreNamespace);
}

function forEachNamespace(fn) {
  forEachProperty(Sugar, (key, val) => {
    if (val.prototype instanceof SugarChainableBase) {
      fn(key);
    }
  });
}

function collectExtendOptions(opt) {
  return Array.isArray(opt) ? { include: opt } : opt;
}

function extendIsAllowed(name, opt) {
  const included = extendOptionsInclude(name, opt);
  const excluded = extendOptionsExclude(name, opt);
  if (included && excluded) {
    throw new Error(ERROR_EXTEND_CONFLICT);
  }
  const isImplicitlyIncluded = !opt || !opt.include;
  return included || (isImplicitlyIncluded && !excluded);
}

function extendOptionsInclude(name, opt) {
  return opt && opt.include && arrayIncludes(opt.include, name);
}

function extendOptionsExclude(name, opt) {
  return opt && opt.exclude && arrayIncludes(opt.exclude, name);
}


// --- Extending via namespace

function extendNamespace(globalName, opt) {
  try {
    opt = collectExtendOptions(opt);
    forEachNamespaceMethod(globalName, (native, methodName, fn, isInstance) => {
      if (canExtendMethod(methodName, native, opt)) {
        extendNative(native, globalName, methodName, fn, isInstance);
      }
    });
  } catch (e) {
    restoreNamespace(globalName);
    throw e;
  }
}

function restoreNamespace(globalName) {
  forEachNamespaceMethod(globalName, (native, methodName, fn, isInstance) => {
    restoreNative(native, globalName, methodName, fn, isInstance);
  });
}

function forEachNamespaceMethod(globalName, fn) {
  const native = globalContext[globalName];
  forEachProperty(Sugar[globalName], (methodName, staticFn) => {
    const instanceFn = instanceMethods.get(globalName, methodName, true);
    if (instanceFn) {
      fn(native.prototype, methodName, instanceFn, true);
    } else {
      fn(native, methodName, staticFn, false);
    }
  });
}

function canExtendMethod(methodName, native, opt) {
  if (isDisallowedEnhancement(methodName, native, opt)) {
    return false;
  }
  return extendIsAllowed(methodName, opt);
}

function isDisallowedEnhancement(methodName, native, opt) {
  if (extendOptionsDisallowExisting(opt)) {
    return hasOwnProperty(native, methodName);
  }
  return false;
}

function extendOptionsDisallowExisting(opt) {
  return opt && opt.existing === false;
}


// --- Chainables

function wrapReturnWithChainable(fn) {
  return function() {
    const result = fn.apply(this.raw, arguments);
    if (!canWrapChainable(result)) {
      return result;
    }
    // Objects may not have prototypes.
    const ctor = result.constructor;
    const globalName = ctor ? ctor.name : 'Object';
    let SugarChainable = Sugar[globalName];
    if (!SugarChainable && (!ctor || ctor === globalContext[globalName])) {
      SugarChainable = createNamespace(globalName);
    }
    return SugarChainable ? new SugarChainable(result) : result;
  };
}

function canWrapChainable(obj) {
  return obj != null && obj !== true && obj !== false;
}

function mapNativeToChainable(globalName, SugarChainable) {

  const proto = globalContext[globalName].prototype;

  Object.getOwnPropertyNames(proto).forEach(methodName => {
    var fn;
    if (nativeMethodProhibitedOnChainable(methodName)) {
      return;
    }
    try {
      fn = proto[methodName];
      if (typeof fn !== 'function') {
        // Bail on anything not a function.
        return;
      }
    } catch (e) {
      // Function.prototype has properties that
      // will throw errors when accessed.
      return;
    }
    return SugarChainable.prototype[methodName] = wrapReturnWithChainable(fn);
  });
}

function nativeMethodProhibitedOnChainable(methodName) {
  // Sugar chainables have their own constructors as well as "valueOf"
  // methods, so exclude them here. The __proto__ argument should be
  // trapped by the function check, however simply accessing this property
  // on Object.prototype causes QML to segfault, so pre-emptively excluding
  // it. Note we're intentionally allowing toString through to allow
  // it to be wrapped as a chainable.
  return methodName === 'constructor'
         || methodName === 'valueOf'
         || methodName === '__proto__';
}


// --- Misc

function exportToBrowser(obj) {
  // TODO: test browserify
  // TODO: test broccoli
  // TODO: test rhino
  // TODO: test QML
  if (typeof window !== 'undefined') {
    try {
    // Reuse already defined Sugar global object.
      globalContext[SUGAR] = globalContext[SUGAR] || obj;
    } catch (e) {
      // Contexts such as QML have a read-only global context.
    }
  }
}


// --- Default exports

const Sugar = {
  VERSION,
  extend,
  restore,
  createNamespace
};

exportToBrowser(Sugar);
export default Sugar;
