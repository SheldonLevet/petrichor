INCLUDE start.ink
INCLUDE end.ink
INCLUDE dune.ink
INCLUDE history.ink
INCLUDE translations.ink




-> menu

== menu ==
    #clear

    #addClass: small
    <img id="thumb" src="images/tree.png">

    + [Start]
    ->start 
    + [History]
    ->history 
    + [Dune]
    ->dune
    + [Translations]
    ->translations
    + [end]
    ->end