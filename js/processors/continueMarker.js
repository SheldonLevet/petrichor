import { InkRunner, Utility, Processor } from "../inkrunner.js";

// puts a nice continue marker after each line of text and removes it when choices appear
// is last in the queue, so will be impacted by #delays

addEventListener(
	"StoryActive",
	(event) => {
		event.detail.inkrunner.AddProcessor(continueMarker);
	},
	{ once: true }
);

const continueMarker = new Processor({
	name: "Continue marker",
	author: "isyourguy",
	description: "Adds continue marker after text (but not choices)",
	type: Processor.Type.AllElements,
	stage: InkRunner.ProcessingStage.AppendChoices,
	priority: -Infinity,
	callback: async (params, inkrunner) => {
		const marker = (display) => {
			if (inkrunner.continueBlockStatus) return;
			if (!display) document.body.querySelectorAll(`[data-ir-role="continue"]`).forEach((e) => e.remove());
			if (display) inkrunner.currentContainer.append(Utility.CreateElement("div", { dataset: { irRole: "continue" } }));
		};

		addEventListener("StoryContinuing", () => marker(false), { once: true });
		addEventListener("ContinueComplete", () => marker(inkrunner.canContinue), { once: true });
	},
});
