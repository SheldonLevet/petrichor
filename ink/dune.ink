== dune ==

#clear

#removeContainer: textcard
#removeContainer: imagecard
#stopAllSounds >> fade:1000

#addContainer: dunecard
#setContainer: dunecard
#playSound: sitar-drone.ogg >> loop:true, volume: 0.5
#playSound: sitar-cauli.ogg >> loop:true, fade:3000, volume: 0.3
#playSound: fm-sitar-drone.ogg >> loop:true, fade: 4000, volume: 0.3
<h1 id="main-title">THE DUNES</h1> #continue

#delay: 3000
#class: add show >> target:main-title
<span></span> #continue

#delay: 3000
#class: remove show >> target:main-title
<span></span> #continue

#delay: 2000
#class: add bg >> target:dunecard
<span></span> #continue

#delay: 3000
#addTextBox: camel
#addTextBox: nomad
#addTextBox: fish
#addTextBox: robot
<span></span> #continue

#delay: 500
#setTextBox: Can you smell the rain >> target:nomad
<span></span>

#setTextBox: Not Yet >> target:camel
<span></span>

#setTextBox: Neither >> target:fish
<span></span>

#setTextBox: What are we going to do >> target:camel
#class: remove show >> target:fish
#class: remove show >> target:nomad
<span></span>

#setTextBox: guys... >> target:camel
<span></span>

#setTextBox: can anyone smell anything >> target:camel
<span></span>

#setTextBox: i can only smell the memory of the river >> target:fish
<span></span>

#setTextBox: im not sure how long i can hang on >> target:fish
#class: remove show >> target:camel
<span></span>

#class: remove show >> target:fish
#setTextBox: i will try and connect to the NOAA-19 >> target:robot
<span></span>

#setTextBox: BLEEP >> target:robot
<span></span> #continue

#delay: 500
#setTextBox: BLOOP >> target:robot
<span></span> #continue

#delay: 500
#setTextBox: BLEEP >> target:robot
<span></span> #continue

#delay: 500
#setTextBox: OK. I have the latest weather maps >> target:robot
<span></span>

#setTextBox: And.... >> target:nomad
<span></span>

#class: remove show >> target:robot
#setTextBox: Robo, hurry up >> target:camel
<span></span>

#setTextBox: I think the rains are coming >> target:robot
<span></span> #continue

#delay: 2000
#playSound: sitar-pulse.ogg >> loop:true, fade:1000, volume: 0.5
#playSound: thunder.ogg >> loop:true, fade:5000, volume: 0.5
#playSound: rain-a.ogg >> loop:true, fade:6000, volume: 0.5
#playSound: rain-b.ogg >> loop:true, fade:6000, volume: 0.5
<span></span> #continue

#delay: 3000
#class: add water >> target:noise
#class: add water >> target:ripple
<span></span> #continue

#delay: 3000
#stopSound: sitar-drone.ogg >> fade:3000
#stopSound: sitar-cauli.ogg >> fade:3000
#stopSound: fm-sitar-drone.ogg >> fade: 4000
#playSound: birds.ogg >> loop:true, fade:6000, volume: 1
<span></span> #continue

#delay: 3000
#class: add spin >> target:noise
#class: add spin >> target:ripple
<span></span> #continue

#delay: 3000
#stopSound: thunder.ogg >> fade:3000
#stopSound: rain-a.ogg >> fade:3000
#playSound: title-a.ogg >> loop:true, fade:6000, volume: 0.6
<span></span> #continue


<p class="quadrant">❖</p>
+ [Continue]
    