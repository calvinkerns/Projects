/* Author: Calvin Kerns
 * Credits to: Phil Nelson (previous professor)
 * Used to expand given lines to assist microshell
*/

#include "defn.h"
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <ctype.h>
#include <dirent.h>
#include <string.h>
#include <signal.h>
#include <sys/wait.h>

// check context of filename, return 1 if matching, 0 if not.
int checkContext(char *context, char *filename)
{
    int contextLen = strlen(context);
    int fileLen = strlen(filename);
    if (contextLen > fileLen)
    {
        return 0;
    }
    for (int i = 1; i <= contextLen; i++)
    {
        if (filename[fileLen - i] != context[contextLen - i])
        {
            return 0;
        }
    }
    return 1;
}

/*This function changes orig to something that is parseable by parsearg in ush.c
it returns 1 if the expansion was successful and 0 otherwise. new will contain the
expanded array of characters*/
int expand(char *orig, char *new, int newsize)
{
    char *origTemp = orig;
    char *newTemp = new;
    char *name;
    char *newTempTemp = new;
    char *finalChar = newTempTemp + newsize;
    int dollar = 0;

    // iterate through orignal string
    while ((*origTemp != 0) && (sigINT != 1))
    {

        // if we get a dollar sign, updated dollar counter, if it's the second in a row return ascii
        if (*origTemp == '$')
        {
            // if we get second dollar sign in a row, then put ascii form of pid in new
            if (dollar == 1)
            {

                char arry[6];
                char *tempPID = arry;
                sprintf(tempPID, "%d", getpid());
                while (*tempPID != 0)
                {
                    // check for overflowing buffer
                    if (finalChar == newTemp)
                    {
                        fprintf(stderr, "Overflowing newline in expand\n");
                        return 0;
                    }
                    // else copy over to new and iterate both
                    *newTemp = *tempPID;
                    tempPID += 1;
                    newTemp += 1;
                }
                dollar = 0;
            }
            else
            {
                dollar = 1;
            }
            origTemp += 1;
        }

        // if we get an open parenth after a $ character then find env and put into new
        else if ((*origTemp == '{') && (dollar == 1))
        {
            dollar = 0;
            origTemp += 1;
            name = origTemp;
            while (*origTemp != '}')
            {
                if (*origTemp == 0)
                {
                    fprintf(stderr, "No second curly brace\n");
                    return 0;
                }
                origTemp += 1;
            }
            *origTemp = 0;
            char *env = getenv(name);

            // go through environment and copy into new
            while (env && *env != 0)
            {
                // check for overflowing buffer
                if (finalChar == newTemp)
                {
                    fprintf(stderr, "Overflowing newline in expand\n");
                    return 0;
                }
                // else copy over to new and iterate both
                *newTemp = *env;
                env += 1;
                newTemp += 1;
            }
            *origTemp = '}';
            origTemp += 1;
        }

        //$n case
        else if ((isdigit(*origTemp)) && (dollar == 1))
        {
            char *numStart = origTemp;
            origTemp += 1;
            while (isdigit(*origTemp))
            {
                origTemp += 1;
            }
            // turn non digit into '\0' temporarily
            char replace = *origTemp;
            *origTemp = 0;
            int num = atoi(numStart);
            *origTemp = replace;
            char *argString;
            // if more than 1 arg
            if (argctr != 1)
            {
                if (num == 0)
                {
                    argString = *(argvs + 1);
                    while (*argString != 0)
                    {
                        // check for overflowing buffer
                        if (finalChar == newTemp)
                        {
                            fprintf(stderr, "Overflowing newline in expand\n");
                            return 0;
                        }
                        // else copy over to new and iterate both
                        *newTemp = *argString;
                        argString += 1;
                        newTemp += 1;
                    }
                }

                // if digit isn't 0
                else
                {
                    // if you asking for to large of an arg, do nothing
                    if (num > argctr - shiftOffset - 2)
                    {
                        ;
                    }
                    else
                    {
                        argString = *(argvs + (num + 1) + shiftOffset);
                        while (*argString != 0)
                        {
                            // check for overflowing buffer
                            if (finalChar == newTemp)
                            {
                                fprintf(stderr, "Overflowing newline in expand\n");
                                return 0;
                            }
                            // else copy over to new and iterate both
                            *newTemp = *argString;
                            argString += 1;
                            newTemp += 1;
                        }
                    }
                }
            }

            // if there is 1 arg
            else
            {
                if (num == 0)
                {
                    char *argString = argvs[0];
                    while (*argString != 0)
                    {
                        // check for overflowing buffer
                        if (finalChar == newTemp)
                        {
                            fprintf(stderr, "Overflowing newline in expand\n");
                            return 0;
                        }
                        // else copy over to new and iterate both
                        *newTemp = *argString;
                        argString += 1;
                        newTemp += 1;
                    }
                }
                // if its not $0, just give empty string
                else
                {
                    ;
                }
            }
            dollar = 0; // reset dollar count
        }

        //$# case
        else if ((*origTemp == '#') && (dollar == 1))
        {
            char argString[10];
            int NumberOfArgs;
            if (argctr == 1)
            {
                NumberOfArgs = 1;
            }
            else
            {
                NumberOfArgs = (argctr - 1 - shiftOffset);
            }
            sprintf(argString, "%d", NumberOfArgs);
            int i = 0;
            while (argString[i] != 0)
            {
                // check for overflowing buffer
                if (finalChar == newTemp)
                {
                    fprintf(stderr, "Overflowing newline in expand\n");
                    return 0;
                }
                // else copy over to new and iterate both
                *newTemp = argString[i];
                i += 1;
                newTemp += 1;
            }
            dollar = 0;
            origTemp += 1;
        }

        //* case
        else if (*origTemp == '*')
        {
            int leading = 1; // 1 means the character before * checks out
            origTemp -= 1;
            if (!(*origTemp == ' '))
            {
                leading = 0;
            }
            origTemp += 1;
            char *originalString = origTemp;
            origTemp += 1;
            char *FileName;
            struct dirent *DirRead;
            DIR *openedDir = opendir(".");
            // if it is * alone, put all files that don't start with . into new
            if (((*origTemp == 0) | (*origTemp == '\n') | (*origTemp == ' ')) && (leading == 1))
            {
                while ((DirRead = readdir(openedDir)) != NULL)
                {
                    FileName = DirRead->d_name;
                    if (*FileName != '.')
                    {
                        while (*FileName != 0)
                        {
                            // check for overflowing buffer
                            if (finalChar == newTemp)
                            {
                                fprintf(stderr, "Overflowing newline in expand\n");
                                return 0;
                            }
                            *newTemp = *FileName;
                            newTemp += 1;
                            FileName += 1;
                        }
                        // check for overflowing buffer
                        if (finalChar == newTemp)
                        {
                            fprintf(stderr, "Overflowing newline in expand\n");
                            return 0;
                        }
                        *newTemp = ' ';
                        newTemp += 1;
                    }
                }
                // get rid of trailing space
                newTemp -= 1;
            }

            // if there is context, deal with it
            else
            {
                int matches = 0;
                // make our context string
                char *context = origTemp;
                while ((*origTemp != 0) && (*origTemp != '\n') && (*origTemp != ' '))
                {
                    origTemp += 1;
                }
                char temporary = *origTemp;
                *origTemp = 0;

                // compare context with filenames
                while (((DirRead = readdir(openedDir)) != NULL) && (leading == 1))
                {
                    for (int i = 0; i < strlen(context); i++)
                    {
                        if (context[i] == '/')
                        {
                            fprintf(stderr, "Found / in context string\n");
                            return 0;
                        }
                    }
                    FileName = DirRead->d_name;
                    int contextStatus = checkContext(context, FileName);
                    if ((*FileName != '.') && contextStatus)
                    {
                        matches += 1;
                        while (*FileName != 0)
                        {
                            // check for overflowing buffer
                            if (finalChar == newTemp)
                            {
                                fprintf(stderr, "Overflowing newline in expand\n");
                                return 0;
                            }
                            *newTemp = *FileName;
                            newTemp += 1;
                            FileName += 1;
                        }
                        // check for overflowing buffer
                        if (finalChar == newTemp)
                        {
                            fprintf(stderr, "Overflowing newline in expand\n");
                            return 0;
                        }
                        *newTemp = ' ';
                        newTemp += 1;
                    }
                }
                // if no matches found just copy over
                if (matches == 0)
                {
                    while (*originalString != 0)
                    {
                        // check for overflowing buffer
                        if (finalChar == newTemp)
                        {
                            fprintf(stderr, "Overflowing newline in expand\n");
                            return 0;
                        }
                        *newTemp = *originalString;
                        newTemp += 1;
                        originalString += 1;
                    }
                }
                // if found matches
                else
                {
                    // get rid of trailing space
                    newTemp -= 1;
                }
                // replace the 0 we put in original
                *origTemp = temporary;
            }
            closedir(openedDir);
        }

        //$? case
        else if ((*origTemp == '?') && (dollar == 1))
        {
            origTemp += 1;
            char numb[50];
            sprintf(numb, "%d", numberReplace);
            int i = 0;
            while (numb[i] != 0)
            {
                // check for overflowing buffer
                if (finalChar == newTemp)
                {
                    fprintf(stderr, "Overflowing newline in expand\n");
                    return 0;
                }
                *newTemp = numb[i];
                newTemp += 1;
                i += 1;
            }
            dollar = 0;
        }

        //$() case
        else if ((*origTemp == '(') && (dollar == 1))
        {
            origTemp += 1;
            char *commandStart = origTemp;
            int parenthCount = 1;
            char c[1];
            while (parenthCount != 0)
            {
                if (*origTemp == '(')
                {
                    parenthCount += 1;
                }
                else if (*origTemp == ')')
                {
                    parenthCount -= 1;
                }
                else if (*origTemp == 0)
                {
                    fprintf(stderr, "No second parenthesis found\n");
                    return 0;
                }
                origTemp += 1;
            }
            // replace last ) with end of string
            origTemp -= 1;
            *origTemp = 0;
            int fd[2];
            if (pipe(fd) != 0)
            {
                perror("pipe failed");
                return 0;
            }

            processline(commandStart, 0, fd[1], NOWAIT|EXPAND); // have process line write to fd[1]
            *origTemp = ')';
            origTemp += 1;
            int spaceReplaced = 0;
            close(fd[1]); // close before reading
            while (read(fd[0], c, 1) == 1)
            {
                if (c[0] == '\n')
                {
                    // check for overflowing buffer
                    if (finalChar == newTemp)
                    {
                        fprintf(stderr, "Overflowing newline in expand\n");
                        return 0;
                    }
                    *newTemp = ' ';
                    newTemp += 1;
                    spaceReplaced = 1;
                }
                else
                {
                    // check for overflowing buffer
                    if (finalChar == newTemp)
                    {
                        fprintf(stderr, "Overflowing newline in expand\n");
                        return 0;
                    }
                    *newTemp = c[0];
                    newTemp += 1;
                    spaceReplaced = 0;
                }
            }
            if (spaceReplaced)
            {
                newTemp -= 1;
                *newTemp = 0;
            }
            dollar = 0;
            close(fd[0]);
            int status;
            //kill any zombies
            while(wait(&status) > 0){
            ;
            }

            if(WIFEXITED(status)){
                numberReplace = WEXITSTATUS(status);
            }
            else if(WIFSIGNALED(status)){
                int SIG = WTERMSIG(status);
                numberReplace = 128 + SIG;
            }
        }

        // copy over from orig to new if no special case is found
        else
        {
            if ((*origTemp == '\\') && (*(origTemp + 1) == '*'))
            {
                origTemp += 1;
            }
            // check for overflowing buffer
            if (finalChar == newTemp)
            {
                fprintf(stderr, "Overflowing newline in expand\n");
                return 0;
            }
            // if we don't find second $ and no { after the first $,then put into new
            if (dollar == 1)
            {
                *newTemp = '$';
                newTemp += 1;
                // check for overflowing buffer
                if (finalChar == newTemp)
                {
                    fprintf(stderr, "Overflowing newline in expand\n");
                    return 0;
                }
                dollar = 0;
            }
            // else copy over to new and iterate
            *newTemp = *origTemp;
            newTemp += 1;
            origTemp += 1;
        }
    }

    // check for final dollar sign
    if (dollar == 1)
    {
        // check for overflowing buffer
        if (finalChar == newTemp)
        {
            fprintf(stderr, "Overflowing newline in expand\n");
            return 0;
        }
        *newTemp = '$';
        newTemp += 1;
    }

    *newTemp = 0;

    // if we find null that means we got through without errors so return 1 to mean success.
    return 1;
}
