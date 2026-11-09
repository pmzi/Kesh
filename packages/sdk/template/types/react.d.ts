/** Minimal React typings for Kesh plugins (self-contained, no node_modules needed). */
declare module 'react' {
  export type ReactNode = ReactElement | string | number | boolean | null | undefined | ReactNode[];
  export interface ReactElement { type: unknown; props: unknown; key: string | null }
  export type SetStateAction<S> = S | ((prev: S) => S);
  export type Dispatch<A> = (value: A) => void;
  export type EffectCallback = () => void | (() => void);
  export type DependencyList = readonly unknown[];
  export interface MutableRefObject<T> { current: T }
  export function createElement(type: unknown, props?: unknown, ...children: unknown[]): ReactElement;
  export const Fragment: unknown;
  export function useState<S>(init: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: EffectCallback, deps?: DependencyList): void;
  export function useRef<T>(init: T): MutableRefObject<T>;
  export function useMemo<T>(f: () => T, deps: DependencyList): T;
  export function useCallback<T extends (...a: any[]) => any>(f: T, deps: DependencyList): T;
  const React: {
    createElement: typeof createElement;
    Fragment: typeof Fragment;
  };
  export default React;
}
declare namespace JSX {
  interface Element { type: unknown; props: unknown; key: string | null }
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: string | number }
}
