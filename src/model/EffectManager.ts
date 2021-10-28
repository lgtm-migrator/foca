import { store } from '../store/StoreAdvanced';
import type { DispatchAction } from './ActionManager';
import type { EffectCtx } from './defineModel';
import { EffectError } from '../exceptions/EffectError';
import { Meta, MetaStateItem } from '../reducers/MetaManger';
import { metaManager } from '../reducers/MetaManger';
import { isPromise } from '../utils/isPromise';

export interface MetaAction extends DispatchAction<object, MetaStateItem> {
  meta: true;
}

export class EffectManager<State extends object> {
  protected readonly uniqueKey: string;

  constructor(
    protected ctx: EffectCtx<State>,
    protected methodName: string,
    protected fn: (...args: any[]) => any,
  ) {
    this.uniqueKey = ctx.name + '_' + methodName;
  }

  execute(args: any[]) {
    const mayBePromise = this.fn.apply(this.ctx, args);

    if (!isPromise<any>(mayBePromise)) {
      return mayBePromise;
    }

    this.dispatchStatus('->', true);

    return mayBePromise
      .then((result) => {
        this.dispatchStatus('ok', false);
        return result;
      })
      .catch((e: unknown) => {
        this.dispatchStatus(
          'fail',
          false,
          e instanceof EffectError
            ? e.meta
            : {
                message: e instanceof Error ? e.message : typeof e === 'string' ? e : void 0,
              },
        );

        // listen-catch?
        throw e;
      });
  }

  dispatchStatus(status: '->' | 'ok' | 'fail', loading: boolean, meta?: Meta) {
    store.dispatch<MetaAction>({
      type: this.uniqueKey + ' ' + status,
      model: this.ctx.name,
      method: this.methodName,
      meta: true,
      payload: {
        loading,
        ...meta,
      },
    });
  }
}

export interface AsyncEffect<
  State extends object = object,
  P extends any[] = any[],
  R = Promise<any>,
> {
  (...args: P): R;
  loading: boolean;
  meta: Partial<MetaStateItem>;
  $$: {
    model: string;
    method: string;
    effect: EffectManager<State>;
  };
}

export type WrapEffect<
  State extends object = object,
  P extends any[] = any[],
  R = Promise<any>,
> = R extends Promise<any>
  ? AsyncEffect<State, P, R>
  : {
      (...args: P): R;
    };

const slice = Array.prototype.slice;

export const wrapEffect = <State extends object>(
  ctx: EffectCtx<State>,
  key: string,
  effect: (...args: any[]) => any,
): WrapEffect<State> => {
  const manager = new EffectManager(ctx, key, effect);
  const fn: WrapEffect<State> = function () {
    return manager.execute.call(manager, slice.call(arguments));
  };

  fn.meta = {};
  fn.loading = false;
  fn.$$ = {
    model: ctx.name,
    method: key,
    effect: manager,
  };

  Object.defineProperties(fn, {
    meta: {
      get() {
        return metaManager.getMeta(ctx.name, key);
      },
    },
    loading: {
      get() {
        return !!fn.meta.loading;
      },
    },
  });

  return fn;
};
