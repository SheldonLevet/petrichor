import { InkRunner, Utility, Processor } from "../inkrunner.js";

// this is a bit different to other processors
// maybe i should make it a different thing...
// anyway, this one actually looks at this array for variable names,
// then creates processors that look for changes to that variable in ink
// two important things for variable processors right now:
// 1. the tag property is the variable name
// 2. inkjs doesn't trigger the observers on story load (or maybe it does but i'm not adding it quick enough)

const inkVariables = [];

addEventListener(
	"StoryLoaded",
	(event) => {
		inkVariables.forEach((inkVariable) => {
			let processor = Object.assign(Object.create(Object.getPrototypeOf(varsToCss)), varsToCss);
			processor.tag = inkVariable;
			processor.callback(inkVariable, InkRunner.instance.story.variablesState[processor.tag]);
			InkRunner.instance.AddProcessor(processor);
		});
	},
	{ once: true }
);

const varsToCss = new Processor({
	name: "Ink variable to CSS variable",
	author: "isyourguy",
	description: "",
	type: Processor.Type.Variable,
	callback: (variableName, newValue) => document.documentElement.style.setProperty(`--${variableName}`, newValue),
});
