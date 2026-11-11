import {read,save} from './io';
const schema={...read('schema.json'),version:'sd-tactical-conditional-pc-v3',featureRevision:'aura-complete-v3'};
save('schema.json',schema);
const initial=read('model-initial.json');initial.schema={...schema,featureMode:'new'};save('model-initial.json',initial);
