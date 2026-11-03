importScripts("optimizer.js","model.js");
let systems=[];
self.onmessage=({data})=>{
  const {type,id,params}=data;
  try {
    if(type==="init"){systems=data.systems;return;}
    const result=XylemModel.solve(systems,params,XylemOpt);
    if(type==="plan"){self.postMessage({type,id,result});return;}
    const n=40,hits=new Array(systems.length).fill(0),rng=XylemModel.random(20261102);
    for(let k=0;k<n;k++){
      const sampled=XylemModel.costScenario(result.costs,rng);
      const chosen=XylemOpt.knapsack(sampled,result.benefits,result.params.budget*1e6);
      for(const i of chosen)hits[i]++;
      if(k%5===4)self.postMessage({type:"progress",id,done:k+1,total:n});
    }
    self.postMessage({type:"uncertainty",id,fingerprint:result.fingerprint,n,frequency:hits.map(x=>x/n)});
  } catch(error){self.postMessage({type:"error",id,message:error.message});}
};
