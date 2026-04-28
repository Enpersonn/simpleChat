
1.
DM chat. Another tab in the new /edit story section where you can chat with a DM LLM chat to plan out and add characters, memmories, locations and everything to your story by just sparing with the LLM. You and it will be able to build the story togheter. The LLM needs to be set up so it can build the story with you not just have the User think of everything but be an actuall partner in creating and planing and being the secroterry in the chat and adding everything that they both aggree on. The things it add comes up as preview cards in the chat where the user can review accept or decline it. 

Every generation step generate-story-characters, locations/generate-fields characters/generate-fields, generate-story-memories, parse-story-characters, parse-story-memories, parse-story-locations, parse-text. are all build in sort of the same way. the parsing
  ones all are build the same and the sotry generations are build the same they both share a lot aswell. Thinking about Tecknical depbt, DRY, SRP and other improtant principles to follow it seems bad that every one of them is written really wet. Thinking about   
  this from an expert perspective trying to minimise duplication, make further development, debugginf and testing much much easier, and cleaning up the code base how can we effectivise the generation. My idea would be to use classes for the big things like     
  agents that can hadnle the repetative things. You are free to reasearch the best ways to handle this. Remember that this DRY refactor can and will be used for things above just genereating filds or parsing. Three main points i see is 1. a shared way to set   
  systempromt that a. gives the rules and b. sets the expoected output. It handles validation of the responses streaming etc. 2. a common way to do generation and merging all the generation logic that will make it easy to add new generation filds later, maybe
  not hold it to location/, character/ but rather we could maybe have a shared story post for generate where we pass inn the type we want wich is a string and the expected body and maybe examples for generation and it can give it back. I think to endpoints can
  handle alot of it one for single object another for list, because in list you can call the single function so the info of list objects dosent degrade in quality the longer the list is as it would if all was generated in one. 3. similar to generate the same
  should be done with parse. Maybe it should work more as a subscribe system where you can call an endpoint to create a listiner on the messages, you give it what you want it to look for and every time a message is sendt a striped messge object is emitted. we
  should also look into efectivising the messages and trying to sanetize them beffore giving them to the llm's maybe try to structure them to make locations, characters or any other thing of interest is easier to extract. When all of this is planed i want you
  to write your interpritation of the refactor into a mandate markdown dock after planing

2.
Paramters like comfort, tense, likability or any slider type or tag in characters or locations should be data driven so its easy to add new sliders for values based on the storys need


3. Make dashboard more custimizable. 
Sidebars are dragable, colapsible etc. 


4. 
Character driven storys where two or more characters speak without user input and the story just goes automatically until the user pauses the story. A narrator can guide the story to keep it on track and it will become a self eveloving book. While the story is written the user can send story requests to the narrator to come with requests to where the user wants the story to go or things they want to happen