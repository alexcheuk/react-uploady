// @flow

import produce from "immer";
import { logger } from "@rpldy/shared";
import { SENDER_EVENTS, UPLOADER_EVENTS } from "../consts";
import processQueueNext from "./processQueueNext";
import * as abortMethods from "./abort";

import type { Cancellable, Batch, BatchItem, CreateOptions } from "@rpldy/shared";
import type { TriggerMethod } from "@rpldy/life-events";
import type { ItemsSender } from "../types";
import type { State } from "./types";

export default (
	options: CreateOptions,
	cancellable: Cancellable,
	trigger: TriggerMethod,
	sender: ItemsSender,
	uploaderId: string,
) => {
	let state = {
		itemQueue: [],
		currentBatch: null,
		batches: {},
		items: {},
		activeIds: [],
		aborts: {},
	};

    const getState = () => state;

	const updateState = (updater: (State) => void) => {
		state = produce(state, updater);
	};

	const add = (item: BatchItem) => {
		updateState((state) => {
			state.items[item.id] = item;
			state.itemQueue.push(item.id);
		});
	};

	const uploadBatch = (batch: Batch, batchOptions: CreateOptions) => {
		updateState((state) => {
			state.batches[batch.id] = { batch, batchOptions };
		});

		batch.items.forEach(add);

		processQueueNext(queueState);
	};

    sender.on(SENDER_EVENTS.PROGRESS,
        (item: BatchItem, completed: number, loaded: number) => {
            if (state.items[item.id]) {
                updateState((state: State) => {
                    const stateItem = state.items[item.id];
                    stateItem.loaded = loaded;
                    stateItem.completed = completed;
                });

                //trigger item progress event for the outside
                trigger(UPLOADER_EVENTS.ITEM_PROGRESS,  getState().items[item.id]);
            }
        });

    const queueState = {
		getOptions: () => options,
		getCurrentActiveCount: () => state.activeIds.length,
        getState,
        updateState,
		trigger,
		cancellable,
		sender,
	};

	if (logger.isDebugOn()) {
		window[`__${uploaderId}_queue_state`] = queueState;
	}

	const abortItem = (id: string) => {
		return abortMethods.abortItem(queueState, id);
	};

	const abortBatch = (id: string) => {
		abortMethods.abortBatch(queueState, id);
	};

	const abortAll = () => {
		abortMethods.abortAll(queueState);
	};

	return {
		updateState,
		getState: queueState.getState,
		uploadBatch,
		abortItem,
		abortBatch,
		abortAll,
	};
};
