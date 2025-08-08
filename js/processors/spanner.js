import { InkRunner, Utility, Processor } from "../inkrunner.js";

// TODO: clarify some of the language in here
// possibly convert spanners into classes?
// would make it a little easier to define them and add custom behaviour

addEventListener(
	"StoryActive",
	(event) => {
		event.detail.inkrunner.AddProcessor(spanner);
	},
	{ once: true }
);

let spannerList = [
	// text wrapped in asterisks is converted to italics
	{
		startString: "*",
		endString: "*",
		element: "i",
		leaveBrackets: false,
	},
	{
		startString: "<y>",
		endString: "</y>",
		classes: ["yellow"],
	},
	{
		startString: "<r>",
		endString: "</r>",
		classes: ["red"],
	},
	{
		startString: "<b>",
		endString: "</b>",
		classes: ["blue"],
	},
	{
		startString: "ACTOR(",
		endString: ")",
		leaveBrackets: false,
		matchToAttr: true,
		attribute: "actor",
		removeMatch: true,
	},
];

// careful with this...
// i tried to escape characters but 🤷
const processSpanner = (spanner, text) => {
	const elementName = spanner.element ? spanner.element : "span";
	const ss = Utility.EscapeString(spanner.startString);
	const es = Utility.EscapeString(spanner.endString);
	const regex = new RegExp(`${ss}(.*?)${es}`, `g`);
	const match = regex.exec(text);
	let attr = "";
	if (!match) return text;
	if (match) attr = spanner.matchToAttr && spanner.attribute ? `data-${spanner.attribute}="${match[1]}"` : "";
	const classes = spanner.classes ? ` class="${spanner.classes.join(" ")}"` : "";
	let replaceText = "";
	if (spanner.removeMatch) {
		replaceText = `<${(elementName + attr + classes).trim()}>`;
		replaceText += text.replaceAll(regex, "").trim();
		replaceText += `</${elementName}>`;
	} else {
		replaceText = `<${(elementName + attr + classes).trim()}>`;
		replaceText += spanner.leaveBrackets ? `${spanner.startString}$1${spanner.endString}` : `$1`;
		replaceText += `</${elementName}>`;
		replaceText = text.replaceAll(regex, replaceText);
	}
	return replaceText;
};

const spanner = new Processor({
	name: "Spanner",
	author: "isyourguy",
	description: "Finds a matching pair of characters and wraps the text between them in a span",
	type: Processor.Type.TextRaw,
	stage: InkRunner.ProcessingStage.PreHTMLConversion,
	callback: async (params) => {
		spannerList.forEach((spanner) => {
			params.text = processSpanner(spanner, params.text);
		});
		return params.text;
	},
});
