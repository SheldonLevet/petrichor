== start ==

#clear

#addContainer: titlecard
#setContainer: titlecard
#playSound: title_loop_a.ogg >> loop:true, fade:4000, volume: 0.3
#playSound: title_loop_b.ogg >> loop:true, fade:4000, volume: 0.5
<h1 id="main-title">PETRICHOR</h1> #continue
<img id="main-cloud" src="images/clouds.png"> #continue
<img id="main-tree" src="images/tree.png"> #continue

#delay: 1000
#class: add show >> target:main-title
<span></span> #continue

#delay: 1000
#class: add show >> target:main-cloud
#class: add show >> target:main-tree
<span></span> #continue

#delay: 3000
<h2 id="sub-title">A TALE OF THE ODOR OF THE SOIL</h2> #continue
#class: add show >> target:sub-title

#delay: 1000
<span></span>

#class: remove show >> target:main-title
#class: remove show >> target:sub-title
#class: add left >> target:main-cloud
#class: add right >> target:main-tree
#delay: 2000

<span></span> #continue

#addContainer: textcard
#setContainer: textcard

#stopSound: title_loop_a.ogg >> fade:2000
#fadeSound: title_loop_b.ogg >> fade:1000, volume: 0.3

<p class="title">Morning, Feburary 1st, A cottage in a valley</p> #continue
#delay: 500

Morning abruptly erupts over the distant hills. Instantaneous light and warmth fills the rooms and urges P to levitate into the day. 

#playSound: door-open.ogg >> volume: 0.5
#playSound: walk.ogg >> loop:true, fade:1000, volume: 0.2
#class: add show >> target:footsteps
P swings open the heavy front door and draws in the warm stale air. They slowly stroll down the path to the fish pond, their robe dragging on the parched and cracked earth. Streams of dusty particles rise off the earth in swirling tornados carrying the metallic tang of the earth. #class: add no-bm

#stopSound: walk.ogg >> fade:500
Hints of lightening. Hints of petrichor. #class: add indent-1 no-bm
The smell before the rain. #class: add indent-2 no-bm #continue

<p class="quadrant">❖</p>

#class: remove show >> target:footsteps
Beyond the hazy hills turbulent air churns the morning sky into dark peaks of energised water. The earthy beings have fallen silent in preparation for salvation. Life may return to these dry lands. 

#playSound: water-splash.ogg >> volume: 0.2
#playSound: walk.ogg >> loop:true, fade:1000, volume: 0.2
#class: add show >> target:footsteps
#callSVGAnimate: splash
P casts the remaining feed in his hand to the catfish in the dwindling pond before turning back towards the house. 

Passing whimpering plants, stagnant trees, shrivelled liverworts he prays the rains will come. The hopeful odors of the spring fragrance had all moved north some days ago, leaving a vacuous anxiety. #continue

<p class="quadrant">❖</p>

#stopSound: walk.ogg >> fade:500
#class: remove show >> target:footsteps
#playSound: drop-on-pond.ogg >> loop:true, volume: 0.4
Large drops pelt the still skin of the pond. Slowly at first, shocking the timid catfish into digging deeper into their silty couches. 

#playSound: rain-roof.ogg >> loop:true, fade:500, volume: 0.4
The tin roof begins to drum along to the rhythmic song growing quicker in tempo as darkness swallows the air above. On the ground a peculiar process erupts. 

#playSound: rain-a.ogg >> loop:true, fade:500, volume: 0.4
#playSound: rain-b.ogg >> loop:true, fade:3000, volume: 0.2
#playSound: thunder.ogg >> loop:true, fade:2000, volume: 0.5
The colliding droplets of water positively effervesce with gases from the rapid reactions with the awaiting dirt below. The rising gases escape the watery cage and disperse into the cooling air, the fruity relaxation spreads to the noses awaiting the signal of life.

The storm gates burst open. Veins of lightening spread across the sky and all the water gushes down on the garden. The birds waiting in the trees pull their feathers over there face and ears as the thunder arrives. #continue

<p class="quadrant">❖</p>

#stopSound: drop-on-pond.ogg >> fade:500
#stopSound: rain-roof.ogg >> fade:500
#stopSound: rain-a.ogg >> fade:1000
#stopSound: rain-b.ogg >> fade:5000
#stopSound: thunder.ogg >> fade:3000
#playSound: title_loop_a.ogg >> loop:true, fade:4000, volume: 0.5
#playSound: birds.ogg >> fade:4000, volume: 0.4
Stillness returns with the scerinade of churping and the soil gurgles down its water. The tempo of the community lurches forward. Leaves that were before so weak and limp begin to stand up and shift their hues back to green. 

The liver worts inflate like jelly filled party baloons looking gleefully up at their tree companions who feet dance in the cool ground. 

#playSound: breath.ogg >> volume: 0.3
P kneels down and palms some soil beneath a tree. Inhales deeply through the moist sponge.

petrichor #class: add indent-1 no-bm #continue
#delay: 500
geosmin #class: add indent-2 no-bm #continue
#delay: 500
balance is returned #class: add indent-3 no-bm #continue

#removeContainer: titlecard
#delay: 1000
<p class="quadrant">❖</p>
+ [Continue]
    -> history