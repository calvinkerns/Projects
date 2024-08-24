/* Author: Calvin Kerns
 * Credits to: Phil Nelson (previous professor)
 * Definitions for Microshell
*/

 #include <sys/types.h>

#define WAIT 1
#define NOWAIT 2
#define EXPAND 4

//global variables
extern int argctr;
extern char **argvs;
extern int shiftOffset;
extern int numberReplace;
extern int SIG;
extern int sigINT;
extern int alivechild;

void my_strmode(mode_t mode, char *p);

int expand(char *orig, char *new, int newsize);

int execBuiltin(char **args, int argNumber, int outfd);

int processline (char *line, int inputFD, int outputFD, int flags);
