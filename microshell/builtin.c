/* Author: Calvin Kerns
 * Credits to: Phil Nelson (previous professor)
 *  Expansion on Microshell
 * Used when microshell identifies a command as 'builtin'
 */
 #include "defn.h"
 #include <stdio.h>
 #include <stdlib.h>
 #include <string.h>
 #include <unistd.h>
 #include <ctype.h>
 #include <sys/types.h>
 #include <grp.h>
 #include <sys/stat.h>
 #include <time.h>
 #include <string.h>
 #include <pwd.h>

int shiftOffset;

void my_strmode(mode_t mode, char *str);

//return 1  and do command if it was a builtin func, return 2 if builtin 
//command errored, return 0 if not builtin
int execBuiltin(char **args, int argNumber, int outfd){

    if(args == NULL){
        return 0;
    }
    if(argNumber == 0){
        return 0;
    }

    //if command is exit
    if(strcmp(*args, "exit") == 0){

        //if there is no other args, just exit
        if(argNumber == 1){
            printf("Process exited with value %d\n", 0);
            exit(0);
        }
        else if(argNumber != 2){
            //check for correct number of args
            fprintf(stderr, "Too many arguments\n");
            return 2;
        }
        else{
            //exit with value of second arg
            int secondArg = atoi(args[1]);
            exit(secondArg);
        }
        return 1;
    }

    //if command is envset
    else if(strcmp(*args, "envset") == 0){
        //check for correct number of args
        if(argNumber != 3){
            fprintf(stderr, "Incorrect amount of arguments\n");
            return 2;
        }
        char *arg2 = args[1];
        char *arg3 = args[2];
        setenv(arg2, arg3, 1);

        return 1;
    }

    //if command is envunset
    else if(strcmp(*args, "envunset") == 0){
        //check for correct number of args
        if(argNumber != 2){
            fprintf(stderr, "Incorrect amount of arguments\n");
            return 2;
        }
        char *arg2 = args[1];
        unsetenv(arg2);

        return 1;
    }

    //if command is cd
    else if(strcmp(*args, "cd") == 0){
        int res = 0;
        if((argNumber != 1) && (argNumber != 2)){ 
            fprintf(stderr, "Incorrect amount of arguments\n");
            return 2;
        }
        //if 1 arg given, go home, else go where specified
        if(argNumber == 1){
            chdir(getenv("HOME"));
        }
        else{
            res = chdir(args[1]);
        }
        if(res == -1){
            perror("cd error");
            return 2;
        }
        return 1;
    }

    //if command is shift
    else if(strcmp(*args, "shift") == 0){
        int shiftamount;
        //set shift amount
         if(argNumber == 1){
            shiftamount = 1;
        }
        else{
            shiftamount = atoi(args[1]);
        }
        //check for shift value that is too large
        if(shiftamount > (argctr - shiftOffset - 2)){
            fprintf(stderr, "Shift value is larger than number of arguments\n");
            return 2;
        }
        shiftOffset += shiftamount;
        return 1;
    }
    
    //if command is unshift
    else if(strcmp(*args, "unshift") == 0){
        //check for errors
        if((argNumber != 2) && (argNumber != 1)){
            fprintf(stderr, "Incorrect amount of arguments\n");
            return 2;
        }

        //unshift arcordingly
        if(argNumber == 2){
            if(atoi(args[1]) > shiftOffset){
                fprintf(stderr, "Unshift value is larger than shift offset\n");
                return 2;
            }
            shiftOffset -= atoi(args[1]);
            //if user tries to unshift too far, just put offset to 0
            if(shiftOffset < 0){
                shiftOffset = 0;
            }
        }
        else{
            shiftOffset = 0;
        }
        return 1;
    }

    //stat command
    else if(strcmp(*args, "sstat") == 0){
        char storage[1024];
        if(argNumber <= 1){
            fprintf(stderr, "Incorrect amount of arguments\n");
            return 2;
        }
        //for each filename
        struct stat stats;
        for(int i=1; i<argNumber; i++){
            if(stat(args[i], &stats) == -1){
                perror("stat failed");
                return 2;
            }

            //print filename
            char *first = args[i];

            //print user stuff
            struct passwd *password = getpwuid(stats.st_uid);
            char *usrnm;
            char UID[20];
            if(password == NULL){
                snprintf(UID, 20, "%d", stats.st_uid);
            }
            else{
                usrnm = password->pw_name;
            }

            //print group stuff
            struct group *grp = getgrgid(stats.st_gid);
            char *grnm;
            char GID[20];
            if(grp == NULL){
                snprintf(GID, 20, "%d", stats.st_gid);
            }
            else{
                grp = NULL;
                grnm = grp->gr_name;
            }

            //permisson stuff
            char arry[12];
            char *fourth;
            my_strmode(stats.st_mode, arry);
            fourth = arry;
            
            //link stuff
            int fifth;
            fifth = stats.st_nlink;

            //size info
            int sixth;
            sixth = stats.st_size;

            //mod time info
            char *seventh;
            time_t *mtim = &(stats.st_mtime);
            seventh = asctime(localtime(mtim));

            int len = snprintf(storage, 1024, "%s %s %s %s%d %d %s", first, usrnm?usrnm : UID, grnm?grnm : GID, fourth, fifth, sixth, seventh);

            if(write(outfd, storage, len) != len){
                perror("write error");
            }
        }
        return 1;
    }

    //if command was not a builtin
    return 0;
}
