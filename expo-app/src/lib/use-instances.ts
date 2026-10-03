import { useSyncExternalStore } from "react";
import {
  getInstances,
  getInstancesRevision,
  subscribeToInstances,
  type MyChartInstance,
} from "@/lib/mychart-instances";

/**
 * The current instance list, re-rendering when a background refresh replaces
 * it. Subscribes on the revision counter rather than the array so the snapshot
 * is a stable primitive — `useSyncExternalStore` would loop forever on a
 * getSnapshot that returned a fresh array each call.
 */
export function useInstances(): MyChartInstance[] {
  useSyncExternalStore(subscribeToInstances, getInstancesRevision, getInstancesRevision);
  return getInstances();
}
