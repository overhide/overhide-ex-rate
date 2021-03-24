# BUILDING
#
#   docker build -t oh-ex-rate -f main/docker/Dockerfile .
#
#   -> build from root of this source (cd ../.. from here)  
#
# RUNNING
#
#   docker run --rm --name oh-ex-rate -p 8110:8110 oh-ex-rate
#
#   -> map to 0.0.0.0:8110 so localhost 8110 works for running tests against container
#   -> if running in VirtualBox (docker-machine) ensure to port forward port 8110 in the docker-machine VM ('default')
#   -> if using docker-machine, make sure to stop machine before running node.js outside of docker:  `docker-machine stop`
#

FROM node:10.13.0

EXPOSE 8110

WORKDIR /home/node/app
COPY package.json /home/node/app/
COPY main/js /home/node/app/main/js/
COPY main/static /home/node/app/main/static/
COPY tools /home/node/app/tools/

ENV PORT 8110

RUN npm install

CMD ["npm", "run", "start"]
