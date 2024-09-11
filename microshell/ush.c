/* Author: Calvin Kerns
 * Credits to: Phil Nelson (previous professor)
 * Main microshell code, getting input from user and processing line
*/

#include <stdio.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <stdlib.h>
#include <sys/types.h>
#include <sys/wait.h>
#include "defn.h"
#include <signal.h>

//globals
int SIG; //1 if sigint happened
int argctr;
char **argvs;
int numberReplace;
int sigINT;
FILE *strm;
int alivechild;


/* Constants */ 

#define LINELEN 200000

/* Prototypes */

int processline (char *line, int inputFD, int outputFD, int flags);

void SIGhandler(int signal_num){ 
  if(alivechild){
    kill(alivechild, SIGINT);
  }
  signal(SIGINT, SIGhandler);
  sigINT = 1;
  (void)signal_num;
}

/*this looks for # to signify a comment, if found it replaces it with '\0' and
returns 1 meaning comment was found, returns 0 otherwise*/
int commentHandler(char buffer[], int length){
  //iterate through and look for #, has special case for $#
  int dollar = 0;
  for(int i = 0; i<length; i++){
    if(buffer[i] == '$'){//ar in a row, reset dollar count
      if(dollar == 1){
      //if it's the second doll
        dollar = 0;
      }
      else{
        dollar = 1;
      }
    }
    else if((buffer[i] == '#') && (dollar == 0)){
      buffer[i] = 0;
      return 1;
    }
    else{
      dollar = 0;
    }
  }
  return 0;
}

/* Shell main */
int
main (int argc, char **argv)
{
    char   buffer [LINELEN];
    int    len;
    argctr = argc;
    argvs = argv;
    shiftOffset = 0;

  //set sig handler
  signal(SIGINT, SIGhandler);

//if we have more than 1 arg
  if(argc != 1){
    strm = fopen(*(argv+1), "r");
    if(strm == NULL){
      perror("Couldn't open file");
      printf("Process exited with value 127\n");
      exit(127);
    }
  }

  while (1) {

  sigINT = 0;//reset sigINT tracker

  //if we have only 1 arg (the ush program)
  if(argc == 1){
        /* prompt and get line */
	  fprintf (stderr, "%% ");
    strm = stdin;
  }

  //check for error
  if (fgets (buffer, LINELEN, strm) != buffer){
	  break;
    }

        /* Get rid of \n at end of buffer. */
	len = strlen(buffer);

  //only remove \n if there was no comment found
  int comment = commentHandler(buffer, len);
  if(comment == 0){
	  if (buffer[len-1] == '\n'){
	    buffer[len-1] = 0;
    }
  }

	
	/* Run it ... */
  
	processline (buffer, 0, 1, WAIT|EXPAND);

    }

    if (!feof(strm)){
        perror ("read");
    }
    return 0;		/* Also known as exit (0); */
}



/*goes through and removes parenthesis from line*/
void removeParenthasis(char *line){
  char *source = line;
  char *dest = line;
  while(*source != '"'){
    source+=1;
    dest+=1;
    if(*source == 0){
      return;
    }
  }
  while(1){
    if(*source == '"'){
      source+=1;
    }
    else if(*source == 0){
      *dest = 0;
      return;
    }
    else{
      *dest = *source;
      dest+=1;
      source+=1;
    }
  }
}

/*Go through line and return an array of pointers to all the arguments in line*/
char ** arg_parse (char *line, int *argcptr){

  char *temp = line;
  char *temp1 = line;
  /*count args*/
  int args = 0;
  while(*temp != 0){
    if(*temp == ' '){
      temp += 1;
    }
    /*we are now in a arg*/
    else{
      args += 1;
      while(1){
	if((*temp == ' ') | (*temp == 0)){
	  break;
	}
	/*we are in parenth argument*/
	if(*temp == '"'){
	  temp += 1;
	  while(*temp != '"'){
	    if(*temp == 0){
	      fprintf(stderr, "No second quotes\n");
	      return NULL;
	    }
	    temp += 1;
	  }
	  temp += 1;
	}
	else{
	  temp += 1;
	}
      }
    }
  }

  /*go through and add char pointers to malloced area*/
  char **mpointer;
  mpointer = malloc(sizeof(char *)*(args+1));
  int index = 0;
  while(*temp1 != 0){
    if(*temp1 == ' '){
      temp1 += 1;
    }
    /*we are now in a arg*/
    else{
      mpointer[index] = temp1;
      index += 1;
      while(1){
	if(*temp1 == ' '){
	  *temp1 = 0;
	  temp1 += 1;
	  break;
	}
	else if(*temp1 == 0){
	  break;
	    }
	/*we are in parenth argument*/
	else if(*temp1 == '"'){
	  temp1 += 1;
	  while(*temp1 != '"'){
	    temp1 += 1;
	  }
	  temp1 += 1;
	}
	else{
	  temp1 += 1;
	}
      }
    }
  }
  
  *argcptr = args;
  char *nptr = NULL;
  mpointer[index] = nptr;
  /*go through each element in malloc and take away parenthasis*/
  for(int i = 0; i < args; i++){
    removeParenthasis(mpointer[i]);
  }
  return mpointer;
}

//return pid of child if it wasn't waited on, else return 0;
int processline (char *line, int inputFD, int outputFD, int flags)
{
    pid_t  cpid;
    int    status;
    int argcptr;
    char **mal;
    int builtreturn;

    char new[LINELEN]; 
    if(flags & EXPAND){
      int expanded = expand(line, new, LINELEN);
      if(expanded == 0){
        return 0;
      }  
    }
    else{
      strncpy(new, line, LINELEN);
    }

    if(sigINT){
      return 0;
    }

    char *newer = new;

    char *pipePTR;
    int input = inputFD;
    int output;
    char *commandline = new;
    if((pipePTR=strchr(new, '|')) != NULL){
      while(pipePTR != NULL){
        *pipePTR = 0; 
        int fd[2];
        if(pipe(fd) != 0){
          perror("pipe failed");
          return 0;
        }
        output = fd[1];
        processline(commandline, input, output, NOWAIT);
        if(input != 0){
          close(input);
        }
        close(output);
        input = fd[0];

        //move pointer to right side of pipe
        *pipePTR = '|';
        pipePTR += 1;
        commandline = pipePTR;
        pipePTR=strchr(commandline, '|');
      }
      processline(commandline, input, outputFD, WAIT);
      close(input);
      //clean up zombies
      while(wait(&status) > 0){
        ;
      }
      return 0;
    }

    mal = arg_parse(newer, &argcptr);
    //if arg[0] was a builtin func, execute and return, if not continue
    builtreturn = execBuiltin(mal, argcptr, outputFD);
    if((builtreturn == 1) || (builtreturn == 2)){
      //if builtin returned with error, update global var
      numberReplace = 0;
      if(builtreturn == 2){
        numberReplace = 1;
      }
      free(mal);
      return 0;
    }

    /*if there are no args, return*/
    if(argcptr == 0){
      free(mal);
      return 0;
    }/*if there is no second parenth*/
    else if(mal == NULL){
       free(mal);
      return 0;
    }
    
    /* Start a new process to do the job. */
    cpid = fork();
    if (cpid < 0) {
      /* Fork wasn't successful */
      perror ("fork");
       free(mal);
      return 0;
    }
    
    /* Check for who we are! */
    if (cpid == 0) {
      /* We are the child! */
      //change input if needed
      if(inputFD != 0){
        dup2(inputFD, 0);
      }
      //change fd if needed 
      if(outputFD != 1){
        dup2(outputFD, 1);
      }
      execvp (mal[0], mal);
      free(mal);
      /* execlp reurned, wasn't successful */
      perror ("exec");
      fclose(strm);  // avoid a linux stdio bug
      _exit (127);
    }

    //check if we need to wait
    alivechild = cpid;
    if(flags & WAIT){
      /* Have the parent wait for child to complete */
      if (wait (&status) < 0) {
        /* Wait wasn't successful */
        perror ("wait");{
        }
      }
      alivechild = 0;
      //update numberReplace var accordingly 
      if(WIFEXITED(status)){
        numberReplace = WEXITSTATUS(status);
      }
      else if(WIFSIGNALED(status)){
        int SIG = WTERMSIG(status);
        if(SIG != SIGINT){
          dprintf(1, "%s", strsignal(SIG));
          if(WCOREDUMP(status)){ 
            dprintf(1, " (core dumped)"); 
          }
          dprintf(1, "\n");
        }
        numberReplace = 128 + SIG;
      }
      free(mal);
      return 0;
    }
    free(mal);
    return cpid;
}

