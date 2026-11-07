/* Learning Corner catalog: the one list of everything on the site.
   To add a topic, add one entry to TOPICS. The home page, the grade pickers,
   "Keep going", and the top bar all read from this list.
   - subject: one of the SUBJECTS ids
   - url: for a topic with one page
   - grades: {grade: page} for a topic with one page per grade (gets a grade picker)
   - label: short text under the title (grade range or ages) */
window.LC_SUBJECTS=[
  {id:'math',name:'Math',icon:'🔢',color:'#6B3FA0',dark:'#C9A8F2'},
  {id:'reading',name:'Reading',icon:'📖',color:'#25558F',dark:'#7FB2EA'},
  {id:'life',name:'Money and life skills',icon:'🪙',color:'#2E7D4F',dark:'#7CDBB0'}
];
window.LC_TOPICS=[
  {id:'multiplication',subject:'math',title:'Multiplication',icon:'✖️',label:'Grades 2–5',
   sub:'Equal groups, arrays, facts, and big numbers',
   grades:{2:'multiplication-grade2.html',3:'multiplication-grade3.html',4:'multiplication-grade4.html',5:'multiplication-grade5.html'},
   gradeInfo:{2:'Equal groups, arrays, skip counting, odd and even',3:'What × means, break-apart facts, missing factors, all the facts',4:'Times as many, factors, times 10s, the area model',5:'The written method, powers of 10, decimals, volume'}},
  {id:'fractions',subject:'math',title:'Fractions',icon:'🍕',label:'Grades 3–5',
   sub:'Parts of a whole, comparing, adding, and division',
   grades:{3:'fractions-grade3.html',4:'fractions-grade4.html',5:'fractions-grade5.html'},
   gradeInfo:{3:'What a fraction is, number lines, equal fractions, sharing',4:'Equivalent fractions, adding, mixed numbers, remainders',5:'Different bottom numbers, multiplying, 2-digit division'}},
  {id:'story-shelf',subject:'reading',title:'Story Shelf',icon:'📚',label:'Grade 3',
   sub:'30 stories with new words, questions, and spelling',url:'story-shelf.html'},
  {id:'money-time',subject:'life',title:'Money Time',icon:'🐷',label:'Ages 5–8',
   sub:'Coins and dollars, adding, sharing, and saving',url:'money-time.html'}
];
