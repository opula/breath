import {useAppSelector} from '../hooks/store';
import {RootState, store} from '../store';

export const getSelectorSnapshot = <T>(
  selector: (state: RootState) => T,
): T => {
  return selector(store.getState());
};

export function useParametrizedAppSelector<T>(
  paramSelector: (state: RootState, params: any) => T,
  params: any,
): T {
  return useAppSelector(state => paramSelector(state, params));
}
