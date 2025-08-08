import { InkRunner, Utility, Processor, Passage, PassageObject } from "../inkrunner.js";

addEventListener(
	"StoryActive",
	() => {
		InkRunner.instance.RemoveProcessor(InkRunner.instance.defaultConvertTextToHTML);
		InkRunner.instance.RemoveProcessor(InkRunner.instance.defaultConvertChoicesToHTML);
		InkRunner.instance.AddProcessor(text, choices);
	},
	{ once: true }
);

const text = new Processor({
	name: "Text wrapper",
	author: "isyourguy",
	description: "Converts text into a <p> element",
	type: Processor.Type.TextRaw,
	stage: InkRunner.ProcessingStage.HTMLConversion,
	priority: -Infinity,
	callback: async (params) => {
		let passage = params.passage;
		let frag = document.createRange().createContextualFragment(passage.text.trim());

		// only wraps text into a <p> element if after parsing the text as HTML there's a root level #text node
		let someText = false;
		Array.from(frag.childNodes).some((e) => (e.nodeName === "#text" ? (someText = true) : undefined));
		if(someText) {
			let p = Utility.CreateElement("p",{dataset:{irRole:"text"}});
			p.append(...Array.from(frag.childNodes));
			passage.elements = [p];
		} else {
			passage.elements = Array.from(frag.childNodes);
		}
	},
});

const choices = new Processor({
	name: "Choice wrapper",
	author: "isyourguy",
	description: "Converts choices into an <a> element and wraps them in a <div>",
	type: Processor.Type.ChoiceRaw,
	stage: InkRunner.ProcessingStage.HTMLConversion,
	priority: -Infinity,
	callback: async (params) => {
		let passage = params.passage;
		let frag = document.createDocumentFragment();
		passage.choices.forEach((choice) => {
			let element = Utility.CreateElement("a", { innerText: choice.text, dataset: { irRole: "choice", irChoiceIndex: choice.index, irChoiceText: choice.text } });
			element.inkdata = choice;
			InkRunner.instance.AddTrigger("choose", { target: element, listener: "click", arguments: choice.index, once: true, stopPropagation: true });
			frag.append(element);
		});
		let choicebox = Utility.CreateElement("div", { dataset: { irRole: "choicebox" } });
		choicebox.append(...Array.from(frag.childNodes));
		addEventListener("ChoiceMade", () => choicebox.remove(), { once: true });
		passage.elements = [choicebox];
	},
});
